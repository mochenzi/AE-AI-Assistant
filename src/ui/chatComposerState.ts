export function reconcileSelectedContextIds(
  selectedIds: string[],
  contexts: Array<{ id: string }>,
): string[] {
  const existingIds = new Set(contexts.map(({ id }) => id));
  return selectedIds.filter((id) => existingIds.has(id));
}
