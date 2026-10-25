/**
 * AcousticPhonemizer.
 * Lightweight algorithmic English phonemizer and acoustic phenomena annotator.
 * Converts any Sentence into rich AcousticChunkData with phoneme ribbons & phenomena tags.
 */

import type { Sentence } from '@typecast/shared-types';
import type {
  AcousticChunkData,
  AcousticWordData,
  AcousticPhonemeData,
  AcousticPhenomenonType,
} from './types';

// Fast dictionary for high-frequency English conversational words
const COMMON_ARPA_DICT: Record<string, string[]> = {
  today: ['T', 'AH0', 'D', 'EY1'],
  we: ['W', 'IY1'],
  will: ['W', 'IH1', 'L'],
  learn: ['L', 'ER1', 'N'],
  how: ['HH', 'AW1'],
  to: ['T', 'AH0'], // reduced
  speak: ['S', 'P', 'IY1', 'K'],
  english: ['IH1', 'NG', 'G', 'L', 'IH0', 'SH'],
  in: ['IH1', 'N'],
  a: ['AH0'],
  restaurant: ['R', 'EH1', 'S', 'T', 'ER0', 'AA0', 'N', 'T'],
  hold: ['HH', 'OW1', 'L', 'D'],
  on: ['AA1', 'N'],
  and: ['AH0', 'N', 'D'], // reduced
  sit: ['S', 'IH1', 'T'],
  down: ['D', 'AW1', 'N'],
  did: ['D', 'IH1', 'D'],
  you: ['Y', 'UW1'],
  the: ['DH', 'AH0'],
  that: ['DH', 'AE1', 'T'],
  this: ['DH', 'IH1', 'S'],
  it: ['IH1', 'T'],
  is: ['IH1', 'Z'],
  for: ['F', 'ER0'],
  of: ['AH0', 'V'],
  with: ['W', 'IH1', 'DH'],
  at: ['AE1', 'T'],
  as: ['AE1', 'Z'],
  be: ['B', 'IY1'],
  have: ['HH', 'AE1', 'V'],
  get: ['G', 'EH1', 'T'],
  what: ['W', 'AH1', 'T'],
  like: ['L', 'AY1', 'K'],
  can: ['K', 'AE1', 'N'],
  could: ['K', 'UH1', 'D'],
  would: ['W', 'UH1', 'D'],
  should: ['SH', 'UH1', 'D'],
  good: ['G', 'UH1', 'D'],
  morning: ['M', 'AO1', 'R', 'N', 'IH0', 'NG'],
  afternoon: ['AE1', 'F', 'T', 'ER0', 'N', 'UW1', 'N'],
  evening: ['IY1', 'V', 'N', 'IH0', 'NG'],
  night: ['N', 'AY1', 'T'],
  welcome: ['W', 'EH1', 'L', 'K', 'AH0', 'M'],
  table: ['T', 'EY1', 'B', 'AH0', 'L'],
  two: ['T', 'UW1'],
  three: ['TH', 'R', 'IY1'],
  four: ['F', 'AO1', 'R'],
  please: ['P', 'L', 'IY1', 'Z'],
  thank: ['TH', 'AE1', 'NG', 'K'],
  menu: ['M', 'EH1', 'N', 'Y', 'UW0'],
  water: ['W', 'AO1', 'T', 'ER0'],
  food: ['F', 'UW1', 'D'],
  order: ['AO1', 'R', 'D', 'ER0'],
  ready: ['R', 'EH1', 'D', 'IY0'],
  want: ['W', 'AA1', 'N', 'T'],
  see: ['S', 'IY1'],
  go: ['G', 'OW1'],
  time: ['T', 'AY1', 'M'],
};

const VOWEL_PHONES = new Set([
  'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW'
]);

const STOP_PHONES = new Set(['P', 'T', 'K', 'B', 'D', 'G']);
const ALVEOLAR_PHONES = new Set(['T', 'D', 'S', 'Z', 'N']);

export function getWordPhones(rawWord: string): string[] {
  const clean = rawWord.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return ['AH0'];

  if (COMMON_ARPA_DICT[clean]) {
    return COMMON_ARPA_DICT[clean];
  }

  // Rule-based G2P
  const phones: string[] = [];
  let i = 0;
  while (i < clean.length) {
    const ch = clean[i];
    const nxt = clean[i + 1] || '';

    if (ch === 't' && nxt === 'h') { phones.push('TH'); i += 2; }
    else if (ch === 's' && nxt === 'h') { phones.push('SH'); i += 2; }
    else if (ch === 'c' && nxt === 'h') { phones.push('CH'); i += 2; }
    else if (ch === 'p' && nxt === 'h') { phones.push('F'); i += 2; }
    else if (ch === 'n' && nxt === 'g') { phones.push('NG'); i += 2; }
    else if (ch === 'e' && nxt === 'e') { phones.push('IY1'); i += 2; }
    else if (ch === 'o' && nxt === 'o') { phones.push('UW1'); i += 2; }
    else if (ch === 'e' && nxt === 'a') { phones.push('IY1'); i += 2; }
    else if (ch === 'a' && (nxt === 'i' || nxt === 'y')) { phones.push('EY1'); i += 2; }
    else if (ch === 'o' && (nxt === 'u' || nxt === 'w')) { phones.push('OW1'); i += 2; }
    else if (ch === 'a') { phones.push('AE1'); i += 1; }
    else if (ch === 'e') { phones.push('EH1'); i += 1; }
    else if (ch === 'i') { phones.push('IH1'); i += 1; }
    else if (ch === 'o') { phones.push('AA1'); i += 1; }
    else if (ch === 'u') { phones.push('AH1'); i += 1; }
    else if (ch === 'b') { phones.push('B'); i += 1; }
    else if (ch === 'c') { phones.push('K'); i += 1; }
    else if (ch === 'd') { phones.push('D'); i += 1; }
    else if (ch === 'f') { phones.push('F'); i += 1; }
    else if (ch === 'g') { phones.push('G'); i += 1; }
    else if (ch === 'h') { phones.push('HH'); i += 1; }
    else if (ch === 'j') { phones.push('JH'); i += 1; }
    else if (ch === 'k') { phones.push('K'); i += 1; }
    else if (ch === 'l') { phones.push('L'); i += 1; }
    else if (ch === 'm') { phones.push('M'); i += 1; }
    else if (ch === 'n') { phones.push('N'); i += 1; }
    else if (ch === 'p') { phones.push('P'); i += 1; }
    else if (ch === 'r') { phones.push('R'); i += 1; }
    else if (ch === 's') { phones.push('S'); i += 1; }
    else if (ch === 't') { phones.push('T'); i += 1; }
    else if (ch === 'v') { phones.push('V'); i += 1; }
    else if (ch === 'w') { phones.push('W'); i += 1; }
    else if (ch === 'y') { phones.push('Y'); i += 1; }
    else if (ch === 'z') { phones.push('Z'); i += 1; }
    else { i += 1; }
  }

  return phones.length > 0 ? phones : ['AH0'];
}

function base(p: string): string {
  return p.replace(/[0-9]/g, '');
}

function isVowel(p: string): boolean {
  return VOWEL_PHONES.has(base(p));
}

function isConsonant(p: string): boolean {
  return !isVowel(p);
}

/**
 * Converts a Sentence object into a fully annotated AcousticChunkData.
 */
export function sentenceToAcousticChunk(sentence: Sentence): AcousticChunkData {
  const startMs = Math.round(sentence.start * 1000);
  const endMs = Math.round(sentence.end * 1000);

  // Extract raw word tokens from text
  const tokens = sentence.text.split(/\s+/).filter(Boolean);
  const wordsData: AcousticWordData[] = [];

  const wordSpan = Math.max(100, Math.round((endMs - startMs) / Math.max(1, tokens.length)));

  for (let idx = 0; idx < tokens.length; idx++) {
    const rawToken = tokens[idx];
    const cleanWord = rawToken.toLowerCase().replace(/[^a-z']/g, '');

    const wStart = startMs + idx * wordSpan;
    const wEnd = idx === tokens.length - 1 ? endMs : wStart + wordSpan - 20;

    const phonesList = getWordPhones(cleanWord);
    const phoneDuration = Math.max(20, Math.round((wEnd - wStart) / Math.max(1, phonesList.length)));

    const phonemes: AcousticPhonemeData[] = phonesList.map((p, pIdx) => {
      const pStart = wStart + pIdx * phoneDuration;
      const pEnd = pIdx === phonesList.length - 1 ? wEnd : pStart + phoneDuration;
      const stressDigit = p.match(/\d$/)?.[0];
      const stress = stressDigit ? parseInt(stressDigit, 10) : 0;
      const isWeakened = p.includes('AH0') || p.includes('IH0') || (isVowel(p) && stress === 0);

      return {
        phoneme: p,
        start_ms: pStart,
        end_ms: pEnd,
        is_weakened: isWeakened,
        stress,
      };
    });

    const phenomena: AcousticPhenomenonType[] = [];

    // Check for REDUCTION
    if (['and', 'to', 'the', 'a', 'an', 'of', 'for', 'in', 'at', 'as'].includes(cleanWord)) {
      phenomena.push('REDUCTION');
    }

    // Check for GLOTTAL_STOP / ELISION in stop codas
    if (cleanWord.endsWith('t') || cleanWord.endsWith('d') || cleanWord.endsWith('p') || cleanWord.endsWith('k')) {
      if (cleanWord.endsWith('t')) {
        phenomena.push('GLOTTAL_STOP');
      }
      phenomena.push('ELISION');
    }

    wordsData.push({
      word: cleanWord || rawToken.toLowerCase(),
      start_ms: wStart,
      end_ms: wEnd,
      phonemes,
      phenomena,
    });
  }

  // Cross-word boundary detection: LINKING, ASSIMILATION, ELISION
  for (let i = 0; i < wordsData.length - 1; i++) {
    const w1 = wordsData[i];
    const w2 = wordsData[i + 1];

    const lastPhone = w1.phonemes[w1.phonemes.length - 1]?.phoneme || '';
    const firstPhone = w2.phonemes[0]?.phoneme || '';

    // LINKING: Consonant + Vowel
    if (isConsonant(lastPhone) && isVowel(firstPhone)) {
      if (!w1.phenomena.includes('LINKING')) {
        w1.phenomena.push('LINKING');
      }
    }

    // ASSIMILATION: Alveolar + Y
    if (ALVEOLAR_PHONES.has(base(lastPhone)) && base(firstPhone) === 'Y') {
      if (!w1.phenomena.includes('ASSIMILATION')) {
        w1.phenomena.push('ASSIMILATION');
      }
    }
  }

  return {
    chunk_id: `chunk_sentence_${sentence.id}`,
    start_ms: startMs,
    end_ms: endMs,
    text: sentence.text,
    words: wordsData,
  };
}
