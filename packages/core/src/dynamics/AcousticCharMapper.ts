/**
 * AcousticCharMapper (Module B).
 * Spatio-temporal mapper between orthographic input characters and acoustic phonemes.
 * Maps every character position (charIndex) in a prosodic chunk to its underlying
 * phoneme segment, weakness flag, and associated acoustic phenomena.
 */

import type {
  AcousticChunkData,
  AcousticWordData,
  AcousticPhonemeData,
  AcousticPhenomenonType,
  CharAcousticContext,
} from './types';

export class AcousticCharMapper {
  private chunk: AcousticChunkData;
  private charContextMap: Map<number, CharAcousticContext> = new Map();

  constructor(chunk: AcousticChunkData) {
    this.chunk = chunk;
    this.buildMapping();
  }

  /**
   * Retrieves the acoustic context for a character at charIndex in the chunk text.
   */
  public getContextAt(charIndex: number): CharAcousticContext {
    const ctx = this.charContextMap.get(charIndex);
    if (ctx) {
      return ctx;
    }

    // Fallback for out-of-bounds or whitespace
    return {
      charIndex,
      char: charIndex < this.chunk.text.length ? this.chunk.text[charIndex] : '',
      wordIndex: -1,
      word: '',
      associatedPhoneme: undefined,
      isWeakenedPhoneme: false,
      associatedPhenomena: [],
      isHighRiskAcousticPoint: false,
    };
  }

  /**
   * Builds the character-to-phoneme spatio-temporal alignment table.
   */
  private buildMapping(): void {
    const text = this.chunk.text;
    const words = this.chunk.words;

    let cursor = 0;

    for (let wIdx = 0; wIdx < words.length; wIdx++) {
      const wordData = words[wIdx];
      const wordStr = wordData.word;

      // Find the start index of this word in the text starting from cursor
      let wordStart = text.toLowerCase().indexOf(wordStr.toLowerCase(), cursor);
      if (wordStart === -1) {
        // Fallback: try searching anywhere after cursor or at cursor
        wordStart = cursor;
      }

      // Handle any whitespace/punctuation before this word
      while (cursor < wordStart && cursor < text.length) {
        const prevWord = wIdx > 0 ? words[wIdx - 1] : null;
        const boundaryPhenomena: AcousticPhenomenonType[] = prevWord
          ? prevWord.phenomena.filter((p) => p === 'LINKING' || p === 'ELISION' || p === 'ASSIMILATION')
          : [];

        this.charContextMap.set(cursor, {
          charIndex: cursor,
          char: text[cursor],
          wordIndex: wIdx > 0 ? wIdx - 1 : 0,
          word: prevWord?.word ?? '',
          associatedPhoneme: undefined,
          isWeakenedPhoneme: false,
          associatedPhenomena: boundaryPhenomena,
          isHighRiskAcousticPoint: boundaryPhenomena.length > 0,
        });
        cursor++;
      }

      // Align word characters with word phonemes
      this.alignWordChars(wordData, wIdx, wordStart);
      cursor = wordStart + wordStr.length;
    }

    // Trailing characters
    while (cursor < text.length) {
      this.charContextMap.set(cursor, {
        charIndex: cursor,
        char: text[cursor],
        wordIndex: words.length - 1,
        word: words[words.length - 1]?.word ?? '',
        associatedPhoneme: undefined,
        isWeakenedPhoneme: false,
        associatedPhenomena: [],
        isHighRiskAcousticPoint: false,
      });
      cursor++;
    }
  }

  /**
   * Aligns characters of a single word with its phoneme sequence.
   */
  private alignWordChars(wordData: AcousticWordData, wordIndex: number, startCharIndex: number): void {
    const wordStr = wordData.word;
    const phonemes = wordData.phonemes;
    const phenomena = wordData.phenomena;

    const charCount = wordStr.length;
    const phoneCount = phonemes.length;

    for (let i = 0; i < charCount; i++) {
      const globalCharIndex = startCharIndex + i;
      const char = wordStr[i];
      const isLastChar = (i === charCount - 1);
      const isFirstChar = (i === 0);

      // Select matching phoneme by proportional alignment
      let matchedPhone: AcousticPhonemeData | undefined;
      if (phoneCount > 0) {
        if (charCount === phoneCount) {
          matchedPhone = phonemes[i];
        } else {
          const ratio = i / Math.max(1, charCount - 1);
          const pIndex = Math.min(phoneCount - 1, Math.round(ratio * (phoneCount - 1)));
          matchedPhone = phonemes[pIndex];
        }
      }

      // Determine weakness and phenomena attribution
      let isWeakened = matchedPhone ? matchedPhone.is_weakened : false;
      const charPhenomena: AcousticPhenomenonType[] = [];

      // 1. Weakened vowel / REDUCTION
      if (matchedPhone) {
        const pSymbol = matchedPhone.phoneme.toUpperCase();
        if (pSymbol.includes('AH0') || pSymbol.includes('IH0') || isWeakened) {
          isWeakened = true;
          if (phenomena.includes('REDUCTION') && !charPhenomena.includes('REDUCTION')) {
            charPhenomena.push('REDUCTION');
          }
        }
      }

      // If word is marked REDUCTION and char is a vowel ('a', 'e', 'i', 'o', 'u')
      if (phenomena.includes('REDUCTION') && /[aeiou]/i.test(char)) {
        isWeakened = true;
        if (!charPhenomena.includes('REDUCTION')) {
          charPhenomena.push('REDUCTION');
        }
      }

      // 2. Boundary phenomena (LINKING, ELISION, ASSIMILATION) attached to word-final consonant
      if (isLastChar) {
        for (const ph of phenomena) {
          if (ph === 'LINKING' || ph === 'ELISION' || ph === 'ASSIMILATION') {
            if (!charPhenomena.includes(ph)) {
              charPhenomena.push(ph);
            }
          }
        }
      }

      // 3. GLOTTAL_STOP / Stop ELISION attached to stops (e.g. 't', 'p', 'k', 'd')
      if (/[t|p|k|b|d|g]/i.test(char)) {
        if (phenomena.includes('GLOTTAL_STOP') && !charPhenomena.includes('GLOTTAL_STOP')) {
          charPhenomena.push('GLOTTAL_STOP');
        }
        if (phenomena.includes('ELISION') && !charPhenomena.includes('ELISION')) {
          charPhenomena.push('ELISION');
        }
      }

      const isHighRisk = isWeakened || charPhenomena.length > 0;

      this.charContextMap.set(globalCharIndex, {
        charIndex: globalCharIndex,
        char,
        wordIndex,
        word: wordStr,
        associatedPhoneme: matchedPhone?.phoneme,
        isWeakenedPhoneme: isWeakened,
        associatedPhenomena: charPhenomena,
        isHighRiskAcousticPoint: isHighRisk,
      });
    }
  }

  /**
   * Returns all acoustic contexts in character sequence.
   */
  public getAllContexts(): CharAcousticContext[] {
    const list: CharAcousticContext[] = [];
    for (let i = 0; i < this.chunk.text.length; i++) {
      list.push(this.getContextAt(i));
    }
    return list;
  }
}
