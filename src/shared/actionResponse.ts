import { validateActionPlan, type AeActionPlan } from './actionProtocol';

export function parseActionResponse(text: string): AeActionPlan {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  let value: unknown;
  try { value = JSON.parse(candidate); } catch { throw new Error('AI 没有返回有效的动作 JSON'); }
  const result = validateActionPlan(value);
  if (!result.ok) throw new Error(`AI 动作计划无效：${result.errors.slice(0, 3).join('；')}`);
  return result.value;
}

export const ACTION_SYSTEM_PROMPT = `你是 After Effects 操作规划器。只能返回一个符合 ae-actions/v1 的 JSON 对象，不要输出 Markdown 或解释。\n允许的动作：project.context、comp.create、layer.text.create、layer.shape.create、layer.solid.create、property.set、keyframe.set、keyframe.delete、expression.set、effect.add、effect.parameter.set、footage.import、layer.delete。\n必须使用用户提供的 projectRevision。不得生成脚本、不得删除工程素材/合成/磁盘文件。删除图层或关键帧时 risk 必须为 high。`;
