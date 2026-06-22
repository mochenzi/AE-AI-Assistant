import { describe, expect, test } from 'vitest';
import { estimateMessages, mergeUsage } from '../src/shared/tokenUsage';

describe('token usage', () => {
  test('estimates non-zero tokens and accumulates actual usage', () => {
    const estimated = estimateMessages([{ role: 'user', content: '请创建一个五秒的片头动画' }]);
    expect(estimated).toBeGreaterThan(5);
    expect(mergeUsage({ input: 10, output: 5 }, { input: 3, output: 2 })).toEqual({ input: 13, output: 7 });
  });
});
