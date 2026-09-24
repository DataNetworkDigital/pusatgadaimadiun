import { describe, it, expect } from 'vitest';
import { demoResetDecision, RESET_STALE_MS } from './demoResetDecision';

const today = '2026-09-24';
const now = Date.UTC(2026, 8, 24, 5, 0, 0);

describe('demoResetDecision', () => {
  it('builds a demo that has never been set up', () => {
    expect(demoResetDecision(null, today, now)).toBe('reset');
  });

  it('resets a demo last reset on another day', () => {
    expect(demoResetDecision({ lastResetDate: '2026-09-23' }, today, now)).toBe('reset');
  });

  it('leaves a demo already reset today alone', () => {
    expect(demoResetDecision({ lastResetDate: today, resetInProgress: false }, today, now)).toBe('ready');
  });

  it('waits for a reset another visit is running right now', () => {
    const data = { lastResetDate: today, resetInProgress: true, resetStartedAtMs: now - 5_000 };
    expect(demoResetDecision(data, today, now)).toBe('wait');
  });

  it('runs again a reset that died partway', () => {
    const data = { lastResetDate: today, resetInProgress: true, resetStartedAtMs: now - RESET_STALE_MS - 1 };
    expect(demoResetDecision(data, today, now)).toBe('reset');
  });

  it('treats a running reset with no start time as dead', () => {
    expect(demoResetDecision({ lastResetDate: today, resetInProgress: true }, today, now)).toBe('reset');
  });
});
