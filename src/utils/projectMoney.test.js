import { describe, it, expect } from 'vitest';
import { projectOfTransaction } from './projectMoney';

const projects = [{ id: 'p1', name: 'Toko Budi' }];

describe('projectOfTransaction', () => {
  it('returns the project a transaction belongs to', () => {
    expect(projectOfTransaction({ id: 't', projectId: 'p1' }, projects)).toEqual(projects[0]);
  });

  it('returns null for ordinary money', () => {
    expect(projectOfTransaction({ id: 't', projectId: null }, projects)).toBeNull();
    expect(projectOfTransaction({ id: 't' }, projects)).toBeNull();
  });

  it('returns null for an orphan whose project no longer exists, so it can still be tidied up', () => {
    expect(projectOfTransaction({ id: 't', projectId: 'gone' }, projects)).toBeNull();
  });
});
