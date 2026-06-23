import { describe, expect, test } from 'vitest';
import { parseAssistantResponse } from '../src/shared/actionResponse';

const validPlan = {
  version: 'ae-actions/v1',
  summary: '读取当前工程',
  risk: 'low',
  projectRevision: 'r1',
  actions: [{ type: 'project.context' }],
};

describe('assistant response parser', () => {
  test('unwraps a natural-language chat response', () => {
    expect(parseAssistantResponse(JSON.stringify({ kind: 'chat', message: '我是你当前选择的 AI 模型。' })))
      .toEqual({ kind: 'chat', visibleText: '我是你当前选择的 AI 模型。' });
  });

  test('unwraps and validates an AE action plan', () => {
    const result = parseAssistantResponse(`\`\`\`json\n${JSON.stringify({ kind: 'ae_action', plan: validPlan })}\n\`\`\``);
    expect(result.kind).toBe('ae_action');
    expect(result.visibleText).toBe('已生成 AE 动作预览：读取当前工程');
    if (result.kind === 'ae_action') expect(result.plan.summary).toBe('读取当前工程');
  });

  test('treats ordinary model text as a safe chat fallback', () => {
    expect(parseAssistantResponse('请告诉我需要修改哪个图层。'))
      .toEqual({ kind: 'chat', visibleText: '请告诉我需要修改哪个图层。' });
  });

  test('does not expose an invalid action as executable', () => {
    const raw = JSON.stringify({ kind: 'ae_action', plan: { ...validPlan, version: 'ae-actions/v2' } });
    const result = parseAssistantResponse(raw);
    expect(result.kind).toBe('chat');
    expect(result.visibleText).toBe('AI 返回的 AE 动作计划无效，未生成可执行操作。');
  });

  test('does not display an unknown JSON envelope', () => {
    const result = parseAssistantResponse('{"action":"project.context"}');
    expect(result).toEqual({ kind: 'chat', visibleText: 'AI 返回格式无法识别，请重试。' });
  });
});
