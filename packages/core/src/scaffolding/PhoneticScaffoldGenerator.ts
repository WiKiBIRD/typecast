/**
 * PhoneticScaffoldGenerator (Module C).
 * Generates structured cognitive contrast cards (Citation IPA vs Actual Surface IPA)
 * and minimal phonetic consonant skeletons to pierce auditory illusions.
 */

import type { AcousticWordData, AcousticPhenomenonType } from '../dynamics/types';
import type { PhoneticRealityHint } from './types';

// Pre-compiled IPA repository for common words & phonetic patterns
interface PhoneticProfile {
  citation: string;
  actual: string;
  explanation: string;
}

const PHENOMENON_TEMPLATES: Record<AcousticPhenomenonType, (word: string, nextWord?: string) => PhoneticProfile> = {
  REDUCTION: (word) => {
    if (word.toLowerCase() === 'and') {
      return {
        citation: '/ænd/',
        actual: '[ən]',
        explanation: '元音已降维弱化为舒瓦中央元音 /ə/，听感接近极轻的鼻音 [n]，原 /æ/ 音色完全消失。',
      };
    }
    if (word.toLowerCase() === 'to') {
      return {
        citation: '/tuː/',
        actual: '[tə]',
        explanation: '长元音 /uː/ 发生弱读中央化为 /ə/，发音时长压缩至原长 1/3。',
      };
    }
    if (word.toLowerCase() === 'the') {
      return {
        citation: '/ðiː/',
        actual: '[ðə]',
        explanation: '元音高度弱化，发音器官处于中性放松位，仅保留轻微齿间摩擦。',
      };
    }
    return {
      citation: `/${word}/`,
      actual: `[${word.toLowerCase().replace(/[aeiou]/g, 'ə')}]`,
      explanation: '该词非重读元音已弱化为中央元音 /ə/（Schwa），请注意捕捉轻柔声学共振峰。',
    };
  },

  LINKING: (word, nextWord) => {
    const pair = nextWord ? `${word} ${nextWord}` : word;
    const cleanW = word.toLowerCase();
    const cleanNext = nextWord ? nextWord.toLowerCase() : '';

    if (cleanW === 'hold' && cleanNext === 'on') {
      return {
        citation: '/həʊld ɒn/',
        actual: '[həʊl-dɒn]',
        explanation: '辅音连读：前词末尾辅音 /d/ 直接滑向后词首元音 /ɒ/，词间零静音，听感如同一整词。',
      };
    }
    if (cleanW === 'on' && cleanNext === 'and') {
      return {
        citation: '/ɒn ænd/',
        actual: '[ɒ-nænd]',
        explanation: '辅音连读：前词末辅音 /n/ 顺向连入后词元音，未出现能量重置断崖。',
      };
    }
    return {
      citation: `/${pair}/`,
      actual: `[${cleanW}-${cleanNext || 'vowel'}]`,
      explanation: '辅音+元音连读：前词末辅音直接跨词架桥进入后词元音发音部位，词间能量未中断。',
    };
  },

  ELISION: (word, nextWord) => {
    const pair = nextWord ? `${word} ${nextWord}` : word;
    const cleanW = word.toLowerCase();

    if (cleanW === 'sit' || (nextWord && nextWord.toLowerCase() === 'down')) {
      return {
        citation: '/sɪt daʊn/',
        actual: '[sɪʔ daʊn]',
        explanation: '失去爆破：/t/ 仅在齿龈处紧密成阻闭塞，无释放除阻气流，直接转入下一辅音。',
      };
    }
    if (cleanW === 'and') {
      return {
        citation: '/ænd/',
        actual: '[ən]',
        explanation: '不完全爆破：词末塞音 /d/ 被完全省音（Elision），气流未形成瞬态冲子。',
      };
    }
    return {
      citation: `/${pair}/`,
      actual: `[${cleanW.slice(0, -1)}̚]`,
      explanation: '塞音爆破缺失：塞音成阻后未经历高频能量释放冲子，需通过前接元音的短暂截断感知。',
    };
  },

  GLOTTAL_STOP: (word) => {
    const cleanW = word.toLowerCase();
    if (cleanW === 'sit') {
      return {
        citation: '/sɪt/',
        actual: '[sɪʔ]',
        explanation: '声门塞音替爆：声带骤停紧闭形成瞬态气流截断（/ʔ/），伴随声门粗糙声，无齿龈除阻。',
      };
    }
    return {
      citation: `/${word}/`,
      actual: `[${cleanW.replace(/t/g, 'ʔ')}]`,
      explanation: '喉塞音（Glottal Stop）：/t/ 被声带闭锁替代，基频轨迹出现陡降中断。',
    };
  },

  ASSIMILATION: (word, nextWord) => {
    const pair = nextWord ? `${word} ${nextWord}` : word;
    return {
      citation: `/${pair}/`,
      actual: `[${word}ʒu]`,
      explanation: '发音部位同化：前词末齿龈音与后词硬腭半元音融合，发音部位后移同化为龈后破擦音。',
    };
  },
};

export class PhoneticScaffoldGenerator {
  /**
   * Generates cognitive contrast card for a word given its acoustic phenomena.
   */
  public generateHint(
    wordData: AcousticWordData,
    nextWordData?: AcousticWordData
  ): PhoneticRealityHint | undefined {
    const phenomena = wordData.phenomena;
    if (phenomena.length === 0) {
      return undefined;
    }

    // Prioritize phenomena order: REDUCTION > LINKING > ELISION > GLOTTAL_STOP > ASSIMILATION
    const priority: AcousticPhenomenonType[] = [
      'REDUCTION',
      'LINKING',
      'ELISION',
      'GLOTTAL_STOP',
      'ASSIMILATION',
    ];

    const selectedPhenomenon = priority.find((p) => phenomena.includes(p)) ?? phenomena[0];
    const generator = PHENOMENON_TEMPLATES[selectedPhenomenon];
    const profile = generator(wordData.word, nextWordData?.word);

    return {
      phenomenon: selectedPhenomenon,
      targetWord: wordData.word,
      ipaCitation: profile.citation,
      ipaActual: profile.actual,
      acousticExplanation: profile.explanation,
    };
  }

  /**
   * Generates minimal consonant skeleton scaffold (e.g. "h _ _ d", "s _ t").
   */
  public generateSkeleton(word: string): string {
    const trimmed = word.trim();
    const len = trimmed.length;

    if (len <= 1) {
      return trimmed;
    }
    if (len === 2) {
      return `${trimmed[0]} _`;
    }

    // Keep first and last characters, fill middle with placeholders
    const first = trimmed[0];
    const last = trimmed[len - 1];
    const middlePlaceholders = Array(len - 2).fill('_').join(' ');

    return `${first} ${middlePlaceholders} ${last}`;
  }
}
