/**
 * Cash the owner receives by hand is still money he holds, so it belongs in an
 * account like any other — otherwise the dashboard total would be smaller than
 * what is actually in his pocket. This finds the account that represents it.
 *
 * `Kas/Tunai` is one of the preset names in AccountForm, so most owners already
 * have one; the alternatives are here because people rename things.
 */
export const CASH_ACCOUNT_NAME = 'Kas/Tunai';

const CASH_NAMES = new Set(['kas/tunai', 'kas', 'tunai']);

export function findCashAccount(accounts) {
  const list = Array.isArray(accounts) ? accounts : [];
  return (
    list.find((a) => a?.kind === 'cash') ||
    list.find((a) => CASH_NAMES.has(String(a?.name || '').trim().toLowerCase())) ||
    null
  );
}
