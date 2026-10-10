import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TypingEngineCore } from '../TypingEngineCore';
import type { Sentence } from '@typecast/shared-types';

function makeSentence(text: string, id = 1): Sentence {
  return {
    id,
    start: 0,
    end: 5,
    text,
    words: text.split(' ').map((word, i) => ({
      word,
      startSec: i * 0.5,
      endSec: i * 0.5 + 0.4,
      score: 0.99,
    })),
  };
}

function typeString(engine: TypingEngineCore, str: string): void {
  for (const ch of str) {
    engine.handleKeyInput(ch);
  }
}

describe('TypingEngineCore — LENIENT 模式', () => {
  let engine: TypingEngineCore;

  beforeEach(() => {
    engine = new TypingEngineCore({ judgeMode: 'LENIENT' });
  });

  it('TC-01: 正确输入每个字符，光标逐步推进', () => {
    engine.loadSentence(makeSentence('hello'));
    expect(engine.handleKeyInput('h')).toBe('CORRECT');
    expect(engine.cursorIndex).toBe(1);
    expect(engine.handleKeyInput('e')).toBe('CORRECT');
    expect(engine.cursorIndex).toBe(2);
  });

  it('TC-02: LENIENT 模式大小写不敏感', () => {
    engine.loadSentence(makeSentence('Hello'));
    expect(engine.handleKeyInput('h')).toBe('CORRECT');
    expect(engine.handleKeyInput('E')).toBe('CORRECT');
  });

  it('TC-03: LENIENT 模式下标点自动跳过', () => {
    engine.loadSentence(makeSentence('hi, there'));
    typeString(engine, 'hi');
    expect(engine.cursorIndex).toBe(4);
    expect(engine.handleKeyInput('t')).toBe('CORRECT');
  });

  it('TC-04: 输入错误字符返回 WRONG', () => {
    engine.loadSentence(makeSentence('hello'));
    expect(engine.handleKeyInput('x')).toBe('WRONG');
    expect(engine.errorCount).toBe(1);
    expect(engine.cursorIndex).toBe(0);
  });

  it('TC-05: Backspace 消除上一个错误', () => {
    engine.loadSentence(makeSentence('hello'));
    engine.handleKeyInput('x');
    expect(engine.errorCount).toBe(1);
    engine.handleKeyInput('h');
    expect(engine.cursorIndex).toBe(1);
    engine.handleKeyInput('Backspace');
    expect(engine.cursorIndex).toBe(0);
  });

  it('TC-06: Tab 键返回 SKIP', () => {
    engine.loadSentence(makeSentence('hello'));
    typeString(engine, 'he');
    const result = engine.handleKeyInput('Tab');
    expect(result).toBe('SKIP');
    expect(engine.cursorIndex).toBe(2);
  });

  it('TC-07: 完整输入整句返回 COMPLETED', () => {
    engine.loadSentence(makeSentence('go'));
    engine.handleKeyInput('g');
    const result = engine.handleKeyInput('o');
    expect(result).toBe('COMPLETED');
  });

  it('TC-08: 整句完成后触发 sentenceCompleted 事件', () => {
    engine.loadSentence(makeSentence('go'));
    const handler = vi.fn();
    engine.on('sentenceCompleted', handler);
    typeString(engine, 'go');
    expect(handler).toHaveBeenCalledOnce();
    const stats = handler.mock.calls[0]![0];
    expect(stats.sentenceId).toBe(1);
    expect(stats.errorCount).toBe(0);
  });

  it('TC-09: reset() 后光标归零', () => {
    engine.loadSentence(makeSentence('hello'));
    typeString(engine, 'hel');
    engine.reset();
    expect(engine.cursorIndex).toBe(0);
    expect(engine.errorCount).toBe(0);
  });

  it('TC-10: 未加载句子时任何按键返回 WRONG', () => {
    expect(engine.handleKeyInput('a')).toBe('WRONG');
  });

  it('TC-11: 连续错误计数递增并在正确后归零', () => {
    engine.loadSentence(makeSentence('abc'));
    engine.handleKeyInput('x');
    engine.handleKeyInput('x');
    expect(engine.consecutiveErrors).toBe(2);
    engine.handleKeyInput('a');
    expect(engine.consecutiveErrors).toBe(0);
  });

  it('TC-12: onKeyResult 事件携带正确的 charIndex 和期望字符', () => {
    engine.loadSentence(makeSentence('ab'));
    const handler = vi.fn();
    engine.on('keyResult', handler);
    engine.handleKeyInput('a');
    expect(handler).toHaveBeenCalledWith('CORRECT', 0, 'a');
  });

  it('TC-13: 单字符句子能正确完成', () => {
    engine.loadSentence(makeSentence('a'));
    const result = engine.handleKeyInput('a');
    expect(result).toBe('COMPLETED');
  });

  it('TC-14: WPM 计算返回数值', () => {
    const completedHandler = vi.fn();
    engine.on('sentenceCompleted', completedHandler);
    engine.loadSentence(makeSentence('test'));
    typeString(engine, 'test');
    const stats = completedHandler.mock.calls[0]![0];
    expect(typeof stats.wpm).toBe('number');
    expect(isNaN(stats.wpm)).toBe(false);
  });

  it('TC-15: on() 返回的取消函数可移除监听器', () => {
    engine.loadSentence(makeSentence('hi'));
    const handler = vi.fn();
    const unsubscribe = engine.on('sentenceCompleted', handler);
    unsubscribe();
    typeString(engine, 'hi');
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('TypingEngineCore — STRICT 模式', () => {
  let engine: TypingEngineCore;

  beforeEach(() => {
    engine = new TypingEngineCore({ judgeMode: 'STRICT' });
  });

  it('TC-16: STRICT 模式大小写敏感', () => {
    engine.loadSentence(makeSentence('Hello'));
    expect(engine.handleKeyInput('h')).toBe('WRONG');
    expect(engine.handleKeyInput('H')).toBe('CORRECT');
  });

  it('TC-17: STRICT 模式标点不自动跳过', () => {
    engine.loadSentence(makeSentence('hi, there'));
    engine.handleKeyInput('h');
    engine.handleKeyInput('i');
    expect(engine.cursorIndex).toBe(2);
    expect(engine.handleKeyInput(',')).toBe('CORRECT');
  });
});
