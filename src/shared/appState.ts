import type { ApiProfile, Capability, ChatMessage, ContextProfile, MediaTask, PromptTemplate } from './types';

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  contextProfileIds: string[];
  archived: boolean;
  createdAt: string;
  archivePath?: string;
  handoffSummary?: string;
}

export interface ActiveModelSelection {
  profileId: string;
  model: string;
}

export type ChatMode = 'chat' | 'ae';

export interface AppState {
  profiles: ApiProfile[];
  defaultProfiles: Partial<Record<'chat' | 'image' | 'video', string>>;
  contexts: ContextProfile[];
  templates: PromptTemplate[];
  conversations: Conversation[];
  tasks: MediaTask[];
  tokenTotals: Record<string, { input: number; output: number }>;
  activeSelections: Partial<Record<Capability, ActiveModelSelection>>;
  archiveDirectory: string;
  conversationDataDirectory: string;
  activeConversationId: string;
  chatMode: ChatMode;
}

export function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex(({ id }) => id === item.id);
  if (index < 0) return [...items, item];
  return items.map((existing) => existing.id === item.id ? item : existing);
}

export function createDefaultState(): AppState {
  return {
    profiles: [], defaultProfiles: {}, contexts: [], conversations: [], tasks: [], tokenTotals: {}, activeSelections: {}, archiveDirectory: '', conversationDataDirectory: '', activeConversationId: '', chatMode: 'chat',
    templates: [
      { id: 'builtin-ae-title', title: '动态片头', category: 'AE 动画', target: 'ae', body: '在当前合成中创建标题“{{title}}”，时长 {{duration}} 秒，制作简洁的淡入和上移动画。', variables: ['title', 'duration'], builtin: true },
      { id: 'builtin-image-bg', title: '氛围背景', category: '图片素材', target: 'image', body: '生成 {{style}} 风格的 {{subject}} 背景，画面比例 {{ratio}}，无文字，适合作为视频背景。', variables: ['style', 'subject', 'ratio'], builtin: true },
      { id: 'builtin-video-loop', title: '无缝动态背景', category: '视频素材', target: 'video', body: '生成一个 {{duration}} 秒无缝循环视频：{{subject}}。镜头稳定，比例 {{ratio}}，无文字。', variables: ['duration', 'subject', 'ratio'], builtin: true },
    ],
  };
}
