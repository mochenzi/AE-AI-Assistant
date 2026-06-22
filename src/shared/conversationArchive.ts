import type { ChatMessage, ContextProfile } from './types';

export interface ArchiveConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  contextProfileIds: string[];
  archived: boolean;
  createdAt: string;
}

const ROLE_LABELS: Record<ChatMessage['role'], string> = {
  system: '系统',
  user: '用户',
  assistant: 'AI 助手',
};

function displayDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

export function serializeConversation(conversation: ArchiveConversation, contexts: ContextProfile[]): string {
  const selectedContexts = conversation.contextProfileIds
    .map((id) => contexts.find((context) => context.id === id))
    .filter((context): context is ContextProfile => Boolean(context));
  const lines = [
    `# ${conversation.title}`,
    '',
    `- 会话 ID：${conversation.id}`,
    `- 创建时间：${displayDate(conversation.createdAt)}`,
    `- 归档时间：${displayDate(new Date().toISOString())}`,
    '',
    '## 已启用的上下文',
    '',
  ];

  if (selectedContexts.length === 0) lines.push('无', '');
  else for (const context of selectedContexts) lines.push(`### ${context.name}`, '', context.content, '');

  lines.push('## 对话记录', '');
  if (conversation.messages.length === 0) lines.push('无对话内容。', '');
  else for (const message of conversation.messages) {
    lines.push(`### ${ROLE_LABELS[message.role]}`, '', message.content, '');
    if (message.usage) {
      const estimated = message.usage.estimated ? '（估算）' : '';
      lines.push(`> Token 用量${estimated}：输入 ${message.usage.input} / 输出 ${message.usage.output} tokens`, '');
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

function safeFilenamePart(value: string, fallback: string): string {
  const cleaned = value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').trim();
  const safe = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(cleaned) ? `_${cleaned}` : cleaned;
  return (safe || fallback).slice(0, 80);
}

export function createArchiveFilename(title: string, createdAt: string, conversationId: string): string {
  const date = new Date(createdAt);
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = Number.isNaN(date.getTime())
    ? 'unknown-date'
    : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${stamp}_${safeFilenamePart(title, '未命名会话')}-${safeFilenamePart(conversationId, 'conversation')}.md`;
}

export function compactArchivedConversation<T extends ArchiveConversation>(conversation: T, archivePath: string, handoffSummary = ''): T & { archivePath: string; handoffSummary: string } {
  if (!archivePath.trim()) throw new Error('归档路径不能为空');
  return { ...conversation, messages: [], archived: true, archivePath, handoffSummary };
}

export async function persistArchiveTransition<T>(
  save: (nextState: T) => Promise<void>,
  nextState: T,
  commit: (nextState: T) => void,
): Promise<void> {
  await save(nextState);
  commit(nextState);
}
