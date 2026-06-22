import { describe, expect, test } from 'vitest';
import { createDefaultState } from '../src/shared/appState';
import { profilesForCapability, resolveSelection, setActiveSelection, withSelectedModel } from '../src/shared/modelSelection';
import type { ApiProfile } from '../src/shared/types';

const profile: ApiProfile = {
  id: 'p1', providerId: 'custom', name: '多模态', baseUrl: 'https://api.test/v1', timeoutMs: 1000,
  capabilities: ['chat', 'image'], headers: {}, cachedModels: [{ id: 'chat-model' }, { id: 'image-v2' }],
  chat: { model: 'chat-default', endpoint: '/chat/completions', structuredOutput: 'json_object' },
  image: { model: 'image-default', endpoint: '/images/generations' },
};

describe('model selection', () => {
  test('resolves the independently stored model for a capability', () => {
    const state = { ...createDefaultState(), profiles: [profile], activeSelections: { chat: { profileId: 'p1', model: 'chat-model' } } };
    expect(resolveSelection(state, 'chat').model).toBe('chat-model');
    expect(resolveSelection(state, 'chat').profile?.id).toBe('p1');
  });

  test('falls back from active selection to legacy default profile and configured model', () => {
    const state = { ...createDefaultState(), profiles: [profile], defaultProfiles: { image: 'p1' } };
    expect(resolveSelection(state, 'image')).toMatchObject({ profileId: 'p1', model: 'image-default' });
  });

  test('overrides only the requested capability model without mutating the saved profile', () => {
    const selected = withSelectedModel(profile, 'image', 'image-v2');
    expect(selected.image?.model).toBe('image-v2');
    expect(selected.chat?.model).toBe('chat-default');
    expect(profile.image?.model).toBe('image-default');
  });

  test('filters profiles by capability and updates one selection without dropping the others', () => {
    const chatOnly: ApiProfile = { ...profile, id: 'p2', capabilities: ['chat'], image: undefined };
    expect(profilesForCapability([profile, chatOnly], 'image').map(({ id }) => id)).toEqual(['p1']);
    expect(setActiveSelection({ chat: { profileId: 'p1', model: 'c' } }, 'image', { profileId: 'p1', model: 'i' })).toEqual({
      chat: { profileId: 'p1', model: 'c' }, image: { profileId: 'p1', model: 'i' },
    });
  });
});
