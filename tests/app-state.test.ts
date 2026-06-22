import { describe, expect, test } from 'vitest';
import { createDefaultState, upsertById } from '../src/shared/appState';

describe('application state', () => {
  test('starts with useful built-in templates and no secrets', () => {
    const state = createDefaultState();
    expect(state.templates.some((item) => item.builtin && item.target === 'ae')).toBe(true);
    expect(JSON.stringify(state)).not.toMatch(/apiKey|secret/i);
  });

  test('upserts entities by stable id', () => {
    expect(upsertById([{ id: 'a', value: 1 }], { id: 'a', value: 2 })).toEqual([{ id: 'a', value: 2 }]);
    expect(upsertById([{ id: 'a', value: 1 }], { id: 'b', value: 2 })).toHaveLength(2);
  });
});
