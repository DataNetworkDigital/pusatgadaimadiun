import { describe, it, expect, beforeEach } from 'vitest';
import { loadColumnKeys, saveColumnKeys } from './exportPrefs';

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    _data: data,
  };
}

describe('exportPrefs', () => {
  beforeEach(() => { globalThis.localStorage = fakeStorage(); });

  it('returns the fallback when nothing was saved', () => {
    expect(loadColumnKeys('project', ['no', 'name'])).toEqual(['no', 'name']);
  });

  it('saves and reads back a selection', () => {
    saveColumnKeys('project', ['no', 'status']);
    expect(loadColumnKeys('project', ['no'])).toEqual(['no', 'status']);
  });

  it('keeps the two export kinds apart', () => {
    saveColumnKeys('project', ['no']);
    saveColumnKeys('collection', ['due']);
    expect(loadColumnKeys('project', [])).toEqual(['no']);
    expect(loadColumnKeys('collection', [])).toEqual(['due']);
  });

  it('falls back when the stored value is corrupt', () => {
    globalThis.localStorage = fakeStorage({ 'pgm.exportCols.project': 'bukan json' });
    expect(loadColumnKeys('project', ['no'])).toEqual(['no']);
  });

  it('falls back when the stored value is an empty list', () => {
    saveColumnKeys('project', []);
    expect(loadColumnKeys('project', ['no'])).toEqual(['no']);
  });

  it('survives storage that throws, as in private mode', () => {
    globalThis.localStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    expect(loadColumnKeys('project', ['no'])).toEqual(['no']);
    expect(() => saveColumnKeys('project', ['no'])).not.toThrow();
  });
});
