/**
 * AcousticStorage.
 * Native IndexedDB persistence layer for FSRS cognitive states,
 * keystroke dynamics latency trajectories, and overcome blindspot counters.
 * Includes graceful memory fallback for SSR / headless test environments.
 */

import type {
  PhenomenonType,
  FSRSItemState,
  LatencyTrajectoryPoint,
} from './types';
import { ALL_PHENOMENA } from './AcousticFSRSEngine';

export interface AcousticPersistedData {
  fsrsStates: Record<PhenomenonType, FSRSItemState> | null;
  keystrokeHistory: Record<PhenomenonType, LatencyTrajectoryPoint[]> | null;
  overcomeCount: number;
}

const DB_NAME = 'TypeCastAcousticDB';
const DB_VERSION = 1;

const STORES = {
  FSRS: 'fsrs_states',
  KEYSTROKE: 'keystroke_history',
  OVERCOME: 'overcome_records',
} as const;

export class AcousticStorage {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private memoryFallback: {
    fsrsStates: Record<PhenomenonType, FSRSItemState> | null;
    keystrokeHistory: Record<PhenomenonType, LatencyTrajectoryPoint[]> | null;
    overcomeCount: number;
  } = {
    fsrsStates: null,
    keystrokeHistory: null,
    overcomeCount: 0,
  };

  /**
   * Opens or returns the cached IndexedDB database connection.
   */
  private getDB(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') {
      return Promise.resolve(null);
    }

    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORES.FSRS)) {
            db.createObjectStore(STORES.FSRS, { keyPath: 'phenomenon' });
          }
          if (!db.objectStoreNames.contains(STORES.KEYSTROKE)) {
            db.createObjectStore(STORES.KEYSTROKE, { keyPath: 'phenomenon' });
          }
          if (!db.objectStoreNames.contains(STORES.OVERCOME)) {
            db.createObjectStore(STORES.OVERCOME, { keyPath: 'id' });
          }
        };

        request.onsuccess = () => {
          resolve(request.result);
        };

        request.onerror = () => {
          console.warn('[AcousticStorage] Failed to open IndexedDB, using memory fallback');
          resolve(null);
        };
      } catch (err) {
        console.warn('[AcousticStorage] IndexedDB initialization error:', err);
        resolve(null);
      }
    });

    return this.dbPromise;
  }

  /**
   * Persists the current FSRS states for all 5 phenomena.
   */
  public async saveFSRSStates(states: Record<PhenomenonType, FSRSItemState>): Promise<void> {
    this.memoryFallback.fsrsStates = { ...states };

    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.FSRS, 'readwrite');
      const store = tx.objectStore(STORES.FSRS);

      for (const ph of ALL_PHENOMENA) {
        if (states[ph]) {
          store.put(states[ph]);
        }
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Loads the stored FSRS states for all 5 phenomena.
   */
  public async loadFSRSStates(): Promise<Record<PhenomenonType, FSRSItemState> | null> {
    const db = await this.getDB();
    if (!db) {
      return this.memoryFallback.fsrsStates;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.FSRS, 'readonly');
      const store = tx.objectStore(STORES.FSRS);
      const req = store.getAll();

      req.onsuccess = () => {
        const items = req.result as FSRSItemState[];
        if (!items || items.length === 0) {
          resolve(this.memoryFallback.fsrsStates);
          return;
        }

        const map: Partial<Record<PhenomenonType, FSRSItemState>> = {};
        items.forEach((item) => {
          map[item.phenomenon] = item;
        });

        // Ensure all phenomena exist
        const hasAny = ALL_PHENOMENA.some((ph) => !!map[ph]);
        if (!hasAny) {
          resolve(null);
          return;
        }

        resolve(map as Record<PhenomenonType, FSRSItemState>);
      };

      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Persists keystroke latency trajectories for all phenomena.
   */
  public async saveKeystrokeHistory(
    history: Record<PhenomenonType, LatencyTrajectoryPoint[]>
  ): Promise<void> {
    this.memoryFallback.keystrokeHistory = { ...history };

    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.KEYSTROKE, 'readwrite');
      const store = tx.objectStore(STORES.KEYSTROKE);

      for (const ph of ALL_PHENOMENA) {
        store.put({
          phenomenon: ph,
          points: history[ph] || [],
          updatedAt: Date.now(),
        });
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Loads keystroke latency trajectories.
   */
  public async loadKeystrokeHistory(): Promise<Record<PhenomenonType, LatencyTrajectoryPoint[]> | null> {
    const db = await this.getDB();
    if (!db) {
      return this.memoryFallback.keystrokeHistory;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.KEYSTROKE, 'readonly');
      const store = tx.objectStore(STORES.KEYSTROKE);
      const req = store.getAll();

      req.onsuccess = () => {
        const records = req.result as Array<{ phenomenon: PhenomenonType; points: LatencyTrajectoryPoint[] }>;
        if (!records || records.length === 0) {
          resolve(this.memoryFallback.keystrokeHistory);
          return;
        }

        const map: Partial<Record<PhenomenonType, LatencyTrajectoryPoint[]>> = {};
        records.forEach((rec) => {
          map[rec.phenomenon] = rec.points;
        });

        resolve(map as Record<PhenomenonType, LatencyTrajectoryPoint[]>);
      };

      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Persists total overcome blindspots count.
   */
  public async saveOvercomeCount(count: number): Promise<void> {
    this.memoryFallback.overcomeCount = count;

    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.OVERCOME, 'readwrite');
      const store = tx.objectStore(STORES.OVERCOME);
      store.put({ id: 'global', count, updatedAt: Date.now() });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Loads total overcome blindspots count.
   */
  public async loadOvercomeCount(): Promise<number> {
    const db = await this.getDB();
    if (!db) {
      return this.memoryFallback.overcomeCount;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.OVERCOME, 'readonly');
      const store = tx.objectStore(STORES.OVERCOME);
      const req = store.get('global');

      req.onsuccess = () => {
        if (req.result && typeof req.result.count === 'number') {
          resolve(req.result.count);
        } else {
          resolve(this.memoryFallback.overcomeCount);
        }
      };

      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Loads all cognitive and keystroke persistence records in one parallel query.
   */
  public async loadAll(): Promise<AcousticPersistedData> {
    const [fsrsStates, keystrokeHistory, overcomeCount] = await Promise.all([
      this.loadFSRSStates(),
      this.loadKeystrokeHistory(),
      this.loadOvercomeCount(),
    ]);

    return {
      fsrsStates,
      keystrokeHistory,
      overcomeCount,
    };
  }

  /**
   * Saves all cognitive data in a single transactional bundle.
   */
  public async saveAll(
    fsrsStates: Record<PhenomenonType, FSRSItemState>,
    keystrokeHistory: Record<PhenomenonType, LatencyTrajectoryPoint[]>,
    overcomeCount: number
  ): Promise<void> {
    await Promise.all([
      this.saveFSRSStates(fsrsStates),
      this.saveKeystrokeHistory(keystrokeHistory),
      this.saveOvercomeCount(overcomeCount),
    ]);
  }

  /**
   * Clears all persisted acoustic storage.
   */
  public async clear(): Promise<void> {
    this.memoryFallback = {
      fsrsStates: null,
      keystrokeHistory: null,
      overcomeCount: 0,
    };

    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.FSRS, STORES.KEYSTROKE, STORES.OVERCOME], 'readwrite');
      tx.objectStore(STORES.FSRS).clear();
      tx.objectStore(STORES.KEYSTROKE).clear();
      tx.objectStore(STORES.OVERCOME).clear();

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const acousticStorage = new AcousticStorage();
