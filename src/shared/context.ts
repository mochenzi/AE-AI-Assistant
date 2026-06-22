import type { ChatMessage } from './types';

export function contextStatus(used: number, limit?: number) {
  if (!limit) return { percent: 0, level: 'unknown' as const };
  const percent = Math.min(100, Math.round((used / limit) * 100));
  return { percent, level: percent >= 95 ? 'blocked' as const : percent >= 80 ? 'warning' as const : 'safe' as const };
}

export function handoffMessages(summary: string, profileNames: string[]): ChatMessage[] {
  return [{ role: 'system', content: `这是上一会话的交接摘要：\n${summary}\n\n继续使用的上下文档案：${profileNames.join('、') || '无'}` }];
}
