/**
 * What a visit to the demo does about the daily reset, decided from the
 * settings document as the visit's transaction read it.
 *
 * The visit that decides 'reset' claims the day in that same transaction, so
 * a second visit (another visitor, or React running the effect twice in
 * development) reads the claim and never empties and refills the demo a
 * second time; a second refill is what duplicated every seeded record.
 *
 * - 'reset': empty and refill the demo, claiming today.
 * - 'wait':  another visit is refilling it right now.
 * - 'ready': today's demo is in place.
 *
 * @param data  the settings document, or null when there is none, with
 *              `resetStartedAtMs` read from its resetStartedAt timestamp.
 */

// A refill takes seconds. One still running after this long died partway
// (tab closed, connection lost) and would otherwise block the demo all day.
export const RESET_STALE_MS = 2 * 60 * 1000;

export function demoResetDecision(data, today, now) {
  if (!data || data.lastResetDate !== today) return 'reset';
  if (!data.resetInProgress) return 'ready';
  const started = Number(data.resetStartedAtMs);
  if (!Number.isFinite(started) || now - started > RESET_STALE_MS) return 'reset';
  return 'wait';
}
