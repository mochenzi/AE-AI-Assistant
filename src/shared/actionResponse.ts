import { validateActionPlan, type AeActionPlan } from './actionProtocol';

export type AssistantResponse =
  | { kind: 'chat'; visibleText: string }
  | { kind: 'ae_action'; visibleText: string; plan: AeActionPlan };

function jsonCandidate(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  return fenced ?? (first >= 0 && last > first ? text.slice(first, last + 1) : '');
}

export function parseAssistantResponse(
  text: string,
  options: { allowAeActions: boolean; currentMode?: 'chat' | 'ae' } = { allowAeActions: false },
): AssistantResponse {
  const raw = text.trim();
  let value: unknown;
  try {
    value = JSON.parse(jsonCandidate(raw));
  } catch {
    return { kind: 'chat', visibleText: raw || 'AI 没有返回内容。' };
  }

  if (value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'chat') {
    const message = (value as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return { kind: 'chat', visibleText: message.trim() };
    }
    return { kind: 'chat', visibleText: 'AI 没有返回可显示的回复。' };
  }

  if (value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'ae_action') {
    if (!options.allowAeActions || options.currentMode === 'chat') {
      return {
        kind: 'chat',
        visibleText: '当前为普通对话模式，已忽略 AI 返回的 AE 操作计划。',
      };
    }
    const result = validateActionPlan((value as { plan?: unknown }).plan);
    if (result.ok) {
      return {
        kind: 'ae_action',
        visibleText: `已生成 AE 动作预览：${result.value.summary}`,
        plan: result.value,
      };
    }
    return { kind: 'chat', visibleText: 'AI 返回的 AE 动作计划无效，未生成可执行操作。' };
  }

  return { kind: 'chat', visibleText: 'AI 返回格式无法识别，请重试。' };
}

const ENVELOPE_RULE = '只返回一个 JSON 对象，不要使用 Markdown。自然语言回答使用 {"kind":"chat","message":"回答内容"}。';

export const CHAT_SYSTEM_PROMPT = `你是 AE AI Assistant，也是一名正常的中文 AI 助手。${ENVELOPE_RULE}\n当前处于普通对话模式：只允许返回 kind 为 chat；不得创建、建议执行或伪装成 AE 动作计划。`;

export const AE_OPERATION_SYSTEM_PROMPT = `你是 After Effects 操作助手。${ENVELOPE_RULE}\n当前处于操作 AE 模式：信息不足时返回 kind 为 chat 并自然追问；信息完整时返回 {"kind":"ae_action","plan":<ae-actions/v1 对象>}。允许动作：project.context、comp.create、layer.text.create、layer.shape.create、layer.solid.create、property.set、keyframe.set、keyframe.delete、expression.set、effect.add、effect.parameter.set、footage.import、layer.delete。动作计划必须使用用户提供的 projectRevision。不得生成脚本、不得删除工程素材/合成/磁盘文件。删除图层或关键帧时 risk 必须为 high。所有动作只生成预览，不声称已经执行。`;
