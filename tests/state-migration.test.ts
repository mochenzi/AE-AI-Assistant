import { describe, expect, test } from 'vitest';
import { migrateState } from '../src/shared/stateMigration';
import { createConversationDocument } from '../src/shared/conversationWorkspace';
import { convertLegacyConversations, persistLegacyConversations } from '../src/shared/conversationMigration';

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

  test('drops malformed legacy collection entries instead of throwing', () => {
    const migrated = migrateState({
      profiles: [null, 'invalid', 42],
      conversations: [null, 'invalid', 42],
    });

    expect(migrated.profiles).toEqual([]);
    expect(migrated.conversations).toEqual([]);
  });

  test('repairs non-string conversation workspace locations', () => {
    const migrated = migrateState({
      conversationDataDirectory: 42,
      activeConversationId: { id: 'c1' },
    });

    expect(migrated.conversationDataDirectory).toBe('');
    expect(migrated.activeConversationId).toBe('');
  });

  test('does not migrate external workspace documents into legacy conversations', () => {
    const external = createConversationDocument(
      'external-c1',
      { key: 'project', label: 'intro.aep', unsaved: false },
      [],
      '2026-06-24T00:00:00.000Z',
    );

    expect(migrateState({ conversations: [external] }).conversations).toEqual([]);
  });

  test('keeps legacy conversations in app state until an external directory is selected', async () => {
    const project = { key: 'project-key', label: 'Project.aep', unsaved: false };
    const state = migrateState({
      conversations: [
        {
          id: 'legacy-c1',
          title: 'Legacy conversation',
          messages: [{ role: 'user', content: 'hello' }],
          contextProfileIds: ['ctx-1'],
          archived: true,
          createdAt: '2026-06-23T00:00:00.000Z',
          handoffSummary: 'handoff note',
        },
      ],
      contexts: [
        {
          id: 'ctx-1',
          name: 'Context one',
          content: 'context body',
          updatedAt: '2026-06-22T00:00:00.000Z',
        },
      ],
      activeConversationId: 'legacy-c1',
    });

    expect(state.conversationDataDirectory).toBe('');
    expect(state.conversations).toHaveLength(1);

    const documents = convertLegacyConversations(
      state.conversations,
      project,
      state.contexts,
      '2026-06-24T00:00:00.000Z',
    );
    expect(documents[0].messages).toEqual(state.conversations[0].messages);
    expect(documents[0]).toMatchObject({
      id: 'legacy-c1',
      project,
      title: 'Legacy conversation',
      contextProfileIds: ['ctx-1'],
      archived: true,
      handoffSummary: 'handoff note',
      createdAt: '2026-06-23T00:00:00.000Z',
      updatedAt: '2026-06-24T00:00:00.000Z',
    });

    const events: string[] = [];
    await persistLegacyConversations(
      documents,
      async () => { events.push('write'); },
      async () => { events.push('clear'); },
    );
    expect(events).toEqual(['write', 'clear']);
  });

  test('does not clear legacy conversations when an external write fails', async () => {
    const documents = convertLegacyConversations(
      [
        {
          id: 'legacy-c1',
          title: 'Legacy conversation',
          messages: [{ role: 'user', content: 'hello' }],
          contextProfileIds: [],
          archived: false,
          createdAt: '2026-06-23T00:00:00.000Z',
        },
      ],
      { key: 'project-key', label: 'Project.aep', unsaved: false },
      [],
      '2026-06-24T00:00:00.000Z',
    );
    const events: string[] = [];

    await expect(
      persistLegacyConversations(
        documents,
        async () => {
          events.push('write');
          throw new Error('disk full');
        },
        async () => { events.push('clear'); },
      ),
    ).rejects.toThrow('disk full');
    expect(events).toEqual(['write']);
  });
});
