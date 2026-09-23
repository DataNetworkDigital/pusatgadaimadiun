import { describe, it, expect } from 'vitest';
import { findCashAccount, CASH_ACCOUNT_NAME } from './cashAccount';

describe('findCashAccount', () => {
  it('prefers an account explicitly marked as cash', () => {
    const accounts = [{ id: 'a', name: 'BCA' }, { id: 'b', name: 'Dompet', kind: 'cash' }];
    expect(findCashAccount(accounts).id).toBe('b');
  });

  it('falls back to the usual names, ignoring case and spacing', () => {
    expect(findCashAccount([{ id: 'x', name: 'Kas/Tunai' }]).id).toBe('x');
    expect(findCashAccount([{ id: 'x', name: ' kas ' }]).id).toBe('x');
    expect(findCashAccount([{ id: 'x', name: 'TUNAI' }]).id).toBe('x');
  });

  it('does not mistake another account for the cash one', () => {
    expect(findCashAccount([{ id: 'a', name: 'BCA' }, { id: 'b', name: 'Kaspro' }])).toBe(null);
  });

  it('survives an empty or missing list', () => {
    expect(findCashAccount([])).toBe(null);
    expect(findCashAccount(null)).toBe(null);
  });

  it('exposes the name used when one has to be created', () => {
    expect(CASH_ACCOUNT_NAME).toBe('Kas/Tunai');
  });
});
