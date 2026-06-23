import { createDefaultState, type ActiveModelSelection, type AppState, type Conversation } from './appState';
import type { ApiProfile, Capability } from './types';

type LegacyState = Partial<AppState> & { profiles?: Array<Partial<ApiProfile>>; conversations?: Array<Partial<Conversation>> };

function copyJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function migrateProfile(profile: Partial<ApiProfile>): ApiProfile {
  return {
    ...copyJson(profile),
    providerId: profile.providerId ?? 'custom',
    cachedModels: copyJson(profile.cachedModels ?? []),
  } as ApiProfile;
}

function migrateConversation(conversation: Partial<Conversation>): Conversation {
  return {
    ...copyJson(conversation),
    messages: copyJson(conversation.messages ?? []),
    contextProfileIds: copyJson(conversation.contextProfileIds ?? []),
    archivePath: conversation.archivePath ?? '',
    handoffSummary: conversation.handoffSummary ?? '',
  } as Conversation;
}

function legacySelections(state: LegacyState, profiles: ApiProfile[]): AppState['activeSelections'] {
  const result: Partial<Record<Capability, ActiveModelSelection>> = {};
  for (const capability of ['chat', 'image', 'video'] as const) {
    const profileId = state.defaultProfiles?.[capability];
    const profile = profiles.find((item) => item.id === profileId);
    const model = profile?.[capability]?.model;
    if (profileId && model) result[capability] = { profileId, model };
  }
  return result;
}

export function migrateState(input: unknown): AppState {
  const defaults = createDefaultState();
  const source = input && typeof input === 'object' ? input as LegacyState : {};
  const profiles = Array.isArray(source.profiles) ? source.profiles.map(migrateProfile) : defaults.profiles;
  const conversations = Array.isArray(source.conversations) ? source.conversations.map(migrateConversation) : defaults.conversations;
  const activeSelections = source.activeSelections
    ? copyJson(source.activeSelections)
    : legacySelections(source, profiles);

  return {
    ...defaults,
    ...copyJson(source),
    profiles,
    defaultProfiles: copyJson(source.defaultProfiles ?? defaults.defaultProfiles),
    contexts: copyJson(source.contexts ?? defaults.contexts),
    templates: copyJson(source.templates ?? defaults.templates),
    conversations,
    tasks: copyJson(source.tasks ?? defaults.tasks),
    tokenTotals: copyJson(source.tokenTotals ?? defaults.tokenTotals),
    activeSelections,
    archiveDirectory: source.archiveDirectory ?? '',
    chatMode: source.chatMode === 'ae' ? 'ae' : 'chat',
  };
}
