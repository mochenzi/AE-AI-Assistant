import { describe, expect, test } from 'vitest';
import { contextStatus, handoffMessages } from '../src/shared/context';

describe('context budgeting', () => {
  test('warns at 80 percent and blocks at 95 percent', () => {
    expect(contextStatus(8000, 10000).level).toBe('warning');
    expect(contextStatus(9500, 10000).level).toBe('blocked');
  });

  test('creates a new conversation from a handoff summary and selected profiles', () => {
    const messages = handoffMessages('已完成片头动画', ['品牌规范', '项目目标']);
    expect(messages[0].content).toContain('已完成片头动画');
    expect(messages[0].content).toContain('品牌规范');
  });
});
