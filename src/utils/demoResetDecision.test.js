import { describe, it, expect } from 'vitest';
import { demoResetDecision } from './demoResetDecision';

const today = '2026-09-24';

describe('demoResetDecision', () => {
  it('builds a demo that has never been set up', () => {
    expect(demoResetDecision(null, today)).toBe('reset');
  });

  it('resets a demo last reset on another day', () => {
    expect(demoResetDecision({ lastResetDate: '2026-09-23' }, today)).toBe('reset');
  });

  it('leaves a demo already reset today alone', () => {
    expect(demoResetDecision({ lastResetDate: today, resetInProgress: false }, today)).toBe('ready');
  });

  it('waits for a reset another visit is running', () => {
    const data = { lastResetDate: today, resetInProgress: true, resetId: 'r1' };
    expect(demoResetDecision(data, today)).toBe('wait');
  });

  it('takes over only the very reset it watched stall, never a newer one', () => {
    const data = { lastResetDate: today, resetInProgress: true, resetId: 'r1' };
    expect(demoResetDecision(data, today, 'r1')).toBe('reset');
    expect(demoResetDecision(data, today, 'r0')).toBe('wait');
    expect(demoResetDecision({ ...data, resetInProgress: false }, today, 'r1')).toBe('ready');
  });

  it('takes over a stalled reset from before claims were named', () => {
    const data = { lastResetDate: today, resetInProgress: true };
    expect(demoResetDecision(data, today)).toBe('wait');
    expect(demoResetDecision(data, today, null)).toBe('wait');
    expect(demoResetDecision(data, today, '')).toBe('reset');
  });
});
