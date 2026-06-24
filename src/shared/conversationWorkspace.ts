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

function hex32(value: number): string {
  return (`00000000${(value >>> 0).toString(16)}`).slice(-8);
}

function stableHash128(value: string): string {
  let first = 1779033703;
  let second = 3144134277;
  let third = 1013904242;
  let fourth = 2773480762;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    first = second ^ Math.imul(first ^ codeUnit, 597399067);
    second = third ^ Math.imul(second ^ codeUnit, 2869860233);
    third = fourth ^ Math.imul(third ^ codeUnit, 951274213);
    fourth = first ^ Math.imul(fourth ^ codeUnit, 2716044179);
  }

  first = Math.imul(third ^ (first >>> 18), 597399067);
  second = Math.imul(fourth ^ (second >>> 22), 2869860233);
  third = Math.imul(first ^ (third >>> 17), 951274213);
  fourth = Math.imul(second ^ (fourth >>> 19), 2716044179);
  first ^= second ^ third ^ fourth;
  second ^= first;
  third ^= first;
  fourth ^= first;

  return `${hex32(first)}${hex32(second)}${hex32(third)}${hex32(fourth)}`;
}

export function projectIdentity(projectPath: string, projectName: string): ProjectIdentity {
  if (!projectPath) {
    return { key: 'unsaved', label: projectName || '\u672a\u4fdd\u5b58\u5de5\u7a0b', unsaved: true };
  }

  const normalized = projectPath.replace(/\\/g, '/').toLowerCase();
  const readable = normalized
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return {
    key: `${readable}_${stableHash128(normalized)}`,
    label: projectName,
    unsaved: false,
  };
}

export function titleFromPrompt(prompt: string): string {
  const normalized = prompt.trim().replace(/\s+/g, ' ');
  return Array.from(normalized).slice(0, 32).join('') || '\u65b0\u5bf9\u8bdd';
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
    project: { ...project },
    title: '\u65b0\u5bf9\u8bdd',
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
