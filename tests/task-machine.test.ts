import { describe, expect, test } from 'vitest';
import { transitionTask } from '../src/shared/taskMachine';

describe('media task state machine', () => {
  test('allows the normal asynchronous video flow', () => {
    let state = transitionTask('queued', 'SUBMIT');
    state = transitionTask(state, 'TASK_ACCEPTED');
    state = transitionTask(state, 'REMOTE_READY');
    state = transitionTask(state, 'DOWNLOADED');
    state = transitionTask(state, 'IMPORTED');
    expect(state).toBe('completed');
  });

  test('rejects an invalid transition', () => {
    expect(() => transitionTask('completed', 'SUBMIT')).toThrow(/completed/);
  });
});
