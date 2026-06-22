export function getByPath(input: unknown, path: string): unknown {
  if (!path) return input;
  let values: unknown[] = [input];
  let wildcard = false;
  for (const segment of path.replace(/^\$\.?/, '').split('.')) {
    const isWildcard = segment.endsWith('[*]');
    const key = isWildcard ? segment.slice(0, -3) : segment;
    values = values.flatMap((value) => {
      if (value === null || typeof value !== 'object') return [];
      const next = (value as Record<string, unknown>)[key];
      if (isWildcard) {
        wildcard = true;
        return Array.isArray(next) ? next : [];
      }
      return next === undefined ? [] : [next];
    });
  }
  return wildcard ? values : values[0];
}
