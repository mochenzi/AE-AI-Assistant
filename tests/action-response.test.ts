import { describe, expect, test } from 'vitest';
import { parseActionResponse } from '../src/shared/actionResponse';

describe('AI action response parser', () => {
  test('extracts a valid plan from a markdown code fence', () => {
    const text = '下面是计划：\n```json\n{"version":"ae-actions/v1","summary":"读取工程","risk":"low","projectRevision":"r1","actions":[{"type":"project.context"}]}\n```';
    expect(parseActionResponse(text).summary).toBe('读取工程');
  });

  test('rejects ordinary assistant text', () => {
    expect(() => parseActionResponse('我建议先创建合成')).toThrow('有效');
  });
});
