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
 * A refill that died partway (tab closed, connection lost) would block the
 * demo all day. A visit that has itself waited RESET_WAIT_MS for one claim
 * may take over exactly that claim: `stalledId` is its id ('' for a claim
 * made before claims carried one). Time is measured on the waiting visit's
 * own clock, never against another device's, so a visitor whose clock runs
 * fast cannot cut a running refill short.
 */

// A refill takes seconds; a visit gives another's refill this long.
export const RESET_WAIT_MS = 2 * 60 * 1000;

export function demoResetDecision(data, today, stalledId) {
  if (!data || data.lastResetDate !== today) return 'reset';
  if (!data.resetInProgress) return 'ready';
  if (stalledId != null && (data.resetId ?? '') === stalledId) return 'reset';
  return 'wait';
}
