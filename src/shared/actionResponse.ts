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

function canUseAeActions(options: { allowAeActions: boolean; currentMode?: 'chat' | 'ae' }): boolean {
  return options.allowAeActions && options.currentMode !== 'chat';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isDirectActionPlan(value: unknown): boolean {
  return isObject(value) && value.version === 'ae-actions/v1';
}

function ignoredAeActionResponse(): AssistantResponse {
  return { kind: 'chat', visibleText: '\u5f53\u524d\u4e3a\u666e\u901a\u5bf9\u8bdd\u6a21\u5f0f\uff0c\u5df2\u5ffd\u7565 AI \u8fd4\u56de\u7684 AE \u64cd\u4f5c\u8ba1\u5212\u3002' };
}

const INVALID_PLAN_TEXT = 'AI \u8fd4\u56de\u7684 AE \u52a8\u4f5c\u8ba1\u5212\u65e0\u6548\uff0c\u672a\u751f\u6210\u53ef\u6267\u884c\u64cd\u4f5c\u3002';

function invalidPlanResponse(errors: string[]): AssistantResponse {
  const reason = errors.slice(0, 3).join('; ');
  if (!reason) return { kind: 'chat', visibleText: INVALID_PLAN_TEXT };
  const [prefix, suffix] = INVALID_PLAN_TEXT.split('\uff0c');
  return {
    kind: 'chat',
    visibleText: `${prefix}\uff1a${reason}\u3002${suffix}`,
  };
}

function parsePlan(planCandidate: unknown): AssistantResponse {
  const result = validateActionPlan(planCandidate);
  if (result.ok) {
    return {
      kind: 'ae_action',
      visibleText: `\u5df2\u751f\u6210 AE \u52a8\u4f5c\u9884\u89c8\uff1a${result.value.summary}`,
      plan: result.value,
    };
  }
  return invalidPlanResponse(result.errors);
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
    return { kind: 'chat', visibleText: raw || 'AI \u6ca1\u6709\u8fd4\u56de\u5185\u5bb9\u3002' };
  }

  if (isObject(value) && value.kind === 'chat') {
    const message = value.message;
    if (typeof message === 'string' && message.trim()) {
      return { kind: 'chat', visibleText: message.trim() };
    }
    return { kind: 'chat', visibleText: 'AI \u6ca1\u6709\u8fd4\u56de\u53ef\u663e\u793a\u7684\u56de\u590d\u3002' };
  }

  if (isObject(value) && value.kind === 'ae_action') {
    if (!canUseAeActions(options)) return ignoredAeActionResponse();
    return parsePlan(value.plan);
  }

  if (isDirectActionPlan(value)) {
    if (!canUseAeActions(options)) return ignoredAeActionResponse();
    return parsePlan(value);
  }

  return { kind: 'chat', visibleText: 'AI \u8fd4\u56de\u683c\u5f0f\u65e0\u6cd5\u8bc6\u522b\uff0c\u8bf7\u91cd\u8bd5\u3002' };
}

const ENVELOPE_RULE = '只返回一个 JSON 对象，不要使用 Markdown。自然语言回答使用 {"kind":"chat","message":"回答内容"}。';

export const CHAT_SYSTEM_PROMPT = `你是 AE AI Assistant，也是一名正常的中文 AI 助手。${ENVELOPE_RULE}\n当前处于普通对话模式：只允许返回 kind 为 chat；不得创建、建议执行或伪装成 AE 动作计划。`;

export const AE_OPERATION_SYSTEM_PROMPT = `你是 After Effects 操作助手。${ENVELOPE_RULE}\n当前处于操作 AE 模式：信息不足时返回 kind 为 chat 并自然追问；信息完整时返回 {"kind":"ae_action","plan":<ae-actions/v1 对象>}。允许动作：project.context、comp.create、layer.text.create、layer.shape.create、layer.solid.create、property.set、keyframe.set、keyframe.delete、expression.set、effect.add、effect.parameter.set、footage.import、layer.delete。动作计划必须使用用户提供的 projectRevision。不得生成脚本、不得删除工程素材/合成/磁盘文件。删除图层或关键帧时 risk 必须为 high。所有动作只生成预览，不声称已经执行。`;

