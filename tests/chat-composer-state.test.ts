import { describe, expect, test } from 'vitest';
import { reconcileSelectedContextIds } from '../src/ui/chatComposerState';

describe('chat composer context selection', () => {
  test('removes IDs for contexts that no longer exist', () => {
    expect(reconcileSelectedContextIds(
      ['kept', 'deleted', 'also-deleted'],
      [{ id: 'kept' }, { id: 'new' }],
    )).toEqual(['kept']);
  });
});
