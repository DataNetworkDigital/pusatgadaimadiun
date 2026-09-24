// A transaction that belongs to a project (its modal, a receipt, a pelunasan,
// a macet recovery) is changed from the project, where the receipt, the
// schedule and the balance move together. Changing it from the Transaksi page
// would move only the balance. Returns that project, or null for ordinary
// money and for an orphan whose project no longer exists.
export function projectOfTransaction(tx, projects) {
  if (!tx?.projectId) return null;
  return (projects || []).find((p) => p.id === tx.projectId) || null;
}

// Whether Edit and Hapus must stay closed for this transaction. While the
// projects are still loading, a projectId cannot be told apart from an
// orphan's, so anything carrying one stays locked until they arrive.
export function isProjectMoney(tx, projects, projectsLoaded) {
  if (!tx?.projectId) return false;
  if (!projectsLoaded) return true;
  return !!projectOfTransaction(tx, projects);
}
