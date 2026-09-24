import { describe, it, expect } from 'vitest';
import { projectOfTransaction, isProjectMoney } from './projectMoney';

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

describe('isProjectMoney', () => {
  it('locks a transaction whose project exists', () => {
    expect(isProjectMoney({ projectId: 'p1' }, projects, true)).toBe(true);
  });

  it('leaves ordinary money and an orphan editable once projects have loaded', () => {
    expect(isProjectMoney({ projectId: null }, projects, true)).toBe(false);
    expect(isProjectMoney({ projectId: 'gone' }, projects, true)).toBe(false);
  });

  it('locks anything carrying a projectId while projects are still loading', () => {
    expect(isProjectMoney({ projectId: 'p1' }, [], false)).toBe(true);
    expect(isProjectMoney({ projectId: 'gone' }, [], false)).toBe(true);
    expect(isProjectMoney({ projectId: null }, [], false)).toBe(false);
  });
});
