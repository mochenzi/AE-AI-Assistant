import { describe, expect, test } from 'vitest';
import { migrateState } from '../src/shared/stateMigration';

describe('state migration', () => {
  test('adds new state fields to a partial legacy state', () => {
    const migrated = migrateState({ profiles: [] });
    expect(migrated.activeSelections).toEqual({});
    expect(migrated.archiveDirectory).toBe('');
    expect(migrated.conversationDataDirectory).toBe('');
    expect(migrated.activeConversationId).toBe('');
    expect(migrated.contexts).toEqual([]);
    expect(migrated.tasks).toEqual([]);
    expect(migrated.chatMode).toBe('chat');
  });

  test('preserves legacy collections and enriches profiles and conversations', () => {
    const legacyProfile = {
      id: 'p1', name: '旧档案', baseUrl: 'https://api.test/v1', timeoutMs: 1000,
      capabilities: ['chat'], headers: {},
      chat: { model: 'chat-model', endpoint: '/chat/completions', structuredOutput: 'json_object' },
    };
    const legacyConversation = {
      id: 'c1', title: '旧会话', messages: [{ role: 'user', content: '你好' }],
      contextProfileIds: [], archived: false, createdAt: '2026-01-01T00:00:00.000Z',
    };
    const migrated = migrateState({
      profiles: [legacyProfile], conversations: [legacyConversation],
      defaultProfiles: { chat: 'p1' }, tokenTotals: { p1: { input: 7, output: 2 } },
    });

    expect(migrated.profiles[0]).toMatchObject({ providerId: 'custom', cachedModels: [] });
    expect(migrated.conversations[0]).toMatchObject({ archivePath: '', handoffSummary: '' });
    expect(migrated.conversations[0].messages).toEqual(legacyConversation.messages);
    expect(migrated.activeSelections.chat).toEqual({ profileId: 'p1', model: 'chat-model' });
    expect(migrated.tokenTotals).toEqual({ p1: { input: 7, output: 2 } });
  });

  test('does not mutate the state object supplied by storage', () => {
    const input = { profiles: [{ id: 'p', cachedModels: [{ id: 'm' }] }] };
    const snapshot = JSON.stringify(input);
    const migrated = migrateState(input);
    migrated.profiles[0].cachedModels!.push({ id: 'other' });
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  test('preserves AE mode and repairs unsupported mode values', () => {
    expect(migrateState({ chatMode: 'ae' }).chatMode).toBe('ae');
    expect(migrateState({ chatMode: 'unexpected' } as never).chatMode).toBe('chat');
  });
});
