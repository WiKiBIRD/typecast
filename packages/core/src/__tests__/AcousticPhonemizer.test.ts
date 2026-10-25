import { describe, it, expect } from 'vitest';
import { sentenceToAcousticChunk, getWordPhones } from '../dynamics';
import type { Sentence } from '@typecast/shared-types';

describe('AcousticPhonemizer: sentenceToAcousticChunk', () => {
  it('correctly phonemizes high-frequency conversational English words', () => {
    const phones = getWordPhones('restaurant');
    expect(phones.length).toBeGreaterThanOrEqual(4);

    const holdPhones = getWordPhones('hold');
    expect(holdPhones).toEqual(['HH', 'OW1', 'L', 'D']);
  });

  it('converts a Sentence into rich AcousticChunkData with phoneme ribbons & phenomena badges', () => {
    const mockSentence: Sentence = {
      id: 1,
      start: 18.5,
      end: 22.8,
      text: 'Today, we will learn how to speak English in a restaurant.',
      words: [
        { word: 'Today,', startSec: 18.5, endSec: 19.0, score: 0.95 },
        { word: 'we', startSec: 19.3, endSec: 19.6, score: 0.95 },
        { word: 'will', startSec: 19.6, endSec: 19.8, score: 0.95 },
        { word: 'learn', startSec: 19.8, endSec: 20.2, score: 0.95 },
        { word: 'how', startSec: 20.2, endSec: 20.4, score: 0.95 },
        { word: 'to', startSec: 20.4, endSec: 20.6, score: 0.95 },
        { word: 'speak', startSec: 20.6, endSec: 21.0, score: 0.95 },
        { word: 'English', startSec: 21.0, endSec: 21.5, score: 0.95 },
        { word: 'in', startSec: 21.5, endSec: 21.7, score: 0.95 },
        { word: 'a', startSec: 21.7, endSec: 21.9, score: 0.95 },
        { word: 'restaurant.', startSec: 21.9, endSec: 22.8, score: 0.95 },
      ],
    };

    const chunk = sentenceToAcousticChunk(mockSentence);

    expect(chunk.chunk_id).toBe('chunk_sentence_1');
    expect(chunk.start_ms).toBe(18500);
    expect(chunk.end_ms).toBe(22800);
    expect(chunk.words.length).toBeGreaterThanOrEqual(10);

    // Verify phoneme ribbon is present
    for (const w of chunk.words) {
      expect(w.phonemes.length).toBeGreaterThan(0);
      expect(w.start_ms).toBeLessThanOrEqual(w.end_ms);
    }

    // "to" or "a" should have REDUCTION
    const toWord = chunk.words.find((w) => w.word === 'to');
    expect(toWord?.phenomena).toContain('REDUCTION');

    const aWord = chunk.words.find((w) => w.word === 'a');
    expect(aWord?.phenomena).toContain('REDUCTION');

    // "restaurant" has coda stop -> GLOTTAL_STOP / ELISION
    const restaurantWord = chunk.words.find((w) => w.word === 'restaurant');
    expect(restaurantWord?.phenomena).toContain('GLOTTAL_STOP');
  });
});
