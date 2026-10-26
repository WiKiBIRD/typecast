import { describe, it, expect } from 'vitest';
import { gradeSentencePractice } from '../scheduler/AcousticFSRSEngine';
import { FSRSGrade } from '../scheduler/types';

describe('gradeSentencePractice (Module M7)', () => {
  it('TC-M7-01: returns AGAIN when errorCount >= 3 or lensTriggered is true', () => {
    expect(gradeSentencePractice(3, false, 400)).toBe(FSRSGrade.AGAIN);
    expect(gradeSentencePractice(0, true, 200)).toBe(FSRSGrade.AGAIN);
    expect(gradeSentencePractice(4, true, 150)).toBe(FSRSGrade.AGAIN);
  });

  it('TC-M7-02: returns HARD when errorCount is 1 or 2 without lens replay', () => {
    expect(gradeSentencePractice(1, false, 300)).toBe(FSRSGrade.HARD);
    expect(gradeSentencePractice(2, false, 500)).toBe(FSRSGrade.HARD);
  });

  it('TC-M7-03: returns EASY when errorCount is 0, lensTriggered is false, and avgIki < 350ms', () => {
    expect(gradeSentencePractice(0, false, 280)).toBe(FSRSGrade.EASY);
  });

  it('TC-M7-04: returns GOOD when errorCount is 0, lensTriggered is false, and avgIki >= 350ms', () => {
    expect(gradeSentencePractice(0, false, 450)).toBe(FSRSGrade.GOOD);
  });
});
