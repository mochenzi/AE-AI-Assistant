import type { ActiveModelSelection, ChatMode } from './appState';
import type { ChatMessage } from './types';

export interface ProjectIdentity {
  key: string;
  label: string;
  unsaved: boolean;
}

export interface MarkdownSnapshot {
  name: string;
  sourcePath: string;
  content: string;
}

export interface ConversationDocument {
  version: 1;
  id: string;
  project: ProjectIdentity;
  title: string;
  messages: ChatMessage[];
  markdownSnapshots: MarkdownSnapshot[];
  contextProfileIds: string[];
  includeActiveComposition: boolean;
  modelSelection?: ActiveModelSelection;
  chatMode: ChatMode;
  tokenUsage: { input: number; output: number };
  archived: boolean;
  handoffSummary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationSummary {
  id: string;
  project: ProjectIdentity;
  title: string;
  createdAt: string;
  updatedAt: string;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function projectIdentity(projectPath: string, projectName: string): ProjectIdentity {
  if (!projectPath) {
    return { key: 'unsaved', label: projectName || '未保存工程', unsaved: true };
  }

  const normalized = projectPath.replace(/\\/g, '/').toLowerCase();
  const readable = normalized
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return {
    key: `${readable}_${stableHash(normalized)}`,
    label: projectName,
    unsaved: false,
  };
}

export function titleFromPrompt(prompt: string): string {
  return prompt.trim().replace(/\s+/g, ' ').slice(0, 32) || '新对话';
}

export function createConversationDocument(
  id: string,
  project: ProjectIdentity,
  markdownSnapshots: MarkdownSnapshot[],
  at: string,
): ConversationDocument {
  return {
    version: 1,
    id,
    project,
    title: '新对话',
    messages: [],
    markdownSnapshots: markdownSnapshots.map((snapshot) => ({ ...snapshot })),
    contextProfileIds: [],
    includeActiveComposition: false,
    chatMode: 'chat',
    tokenUsage: { input: 0, output: 0 },
    archived: false,
    createdAt: at,
    updatedAt: at,
  };
}

export function summarizeConversation(value: ConversationDocument): ConversationSummary {
  return {
    id: value.id,
    project: value.project,
    title: value.title,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}
