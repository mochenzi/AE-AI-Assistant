import { describe, expect, test } from 'vitest';
import { getByPath } from '../src/shared/jsonPath';

describe('JSON path', () => {
  test('reads dotted properties and array wildcards', () => {
    const data = { data: [{ id: 'a' }, { id: 'b' }], account: { balance: 12.5 } };
    expect(getByPath(data, 'account.balance')).toBe(12.5);
    expect(getByPath(data, 'data[*].id')).toEqual(['a', 'b']);
  });
});
