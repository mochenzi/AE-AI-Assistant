// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, test } from 'vitest';
import {
  ChatModelMenu,
  collectChatModelChoices,
  findCurrentChatModelChoice,
} from '../src/ui/ChatModelMenu';
import type { ApiProfile } from '../src/shared/types';

function profile(id: string, name: string, configured: string, cached: string[]): ApiProfile {
  return {
    id, name, providerId: 'custom', baseUrl: 'https://example.com/v1', timeoutMs: 1000,
    capabilities: ['chat'], headers: {},
    chat: { endpoint: '/chat/completions', model: configured, structuredOutput: 'json_object' },
    cachedModels: cached.map((model) => ({ id: model })),
  } as ApiProfile;
}

describe('ChatModelMenu', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.replaceChildren(container);
    root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  test('groups configured and cached chat models without duplicates', () => {
    expect(collectChatModelChoices([
      profile('p1', 'DeepSeek', 'deepseek-chat', ['deepseek-chat', 'deepseek-reasoner']),
      profile('p2', '豆包', 'doubao-pro', []),
    ])).toEqual([
      { profileId: 'p1', profileName: 'DeepSeek', model: 'deepseek-chat' },
      { profileId: 'p1', profileName: 'DeepSeek', model: 'deepseek-reasoner' },
      { profileId: 'p2', profileName: '豆包', model: 'doubao-pro' },
    ]);
  });

  test('only accepts a selection that is present in the current choices', () => {
    const profiles = [profile('p1', 'DeepSeek', 'deepseek-chat', [])];
    expect(findCurrentChatModelChoice(profiles, { profileId: 'p1', model: 'deepseek-chat' }))
      .toMatchObject({ profileId: 'p1', model: 'deepseek-chat' });
    expect(findCurrentChatModelChoice(profiles, { profileId: 'p1', model: 'removed-model' }))
      .toBeUndefined();
    expect(findCurrentChatModelChoice(profiles, { profileId: 'deleted-profile', model: 'deepseek-chat' }))
      .toBeUndefined();
    expect(findCurrentChatModelChoice([
      profile('p2', 'Empty', '', []),
    ], { profileId: 'p2', model: '' })).toBeUndefined();
  });

  test('opens grouped choices and reports profile and model together', () => {
    const changes: Array<{ profileId: string; model: string }> = [];
    act(() => root.render(
      <ChatModelMenu
        profiles={[profile('p1', 'DeepSeek', 'deepseek-chat', ['deepseek-reasoner'])]}
        selection={{ profileId: 'p1', model: 'deepseek-chat' }}
        onChange={(value) => changes.push(value)}
      />,
    ));

    act(() => (container.querySelector('[aria-label="选择聊天模型"]') as HTMLButtonElement).click());
    expect(container.textContent).toContain('DeepSeek');
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(container.querySelector('[role="menuitemradio"]')).toBeNull();
    const options = container.querySelectorAll('.chat-model-group button');
    expect(options[0].getAttribute('aria-current')).toBe('true');
    act(() => (options[1] as HTMLButtonElement).click());
    expect(changes).toEqual([{ profileId: 'p1', model: 'deepseek-reasoner' }]);
  });

  test('keeps profiles with the same display name in separate groups', () => {
    const changes: Array<{ profileId: string; model: string }> = [];
    act(() => root.render(
      <ChatModelMenu
        profiles={[
          profile('p1', '自定义', 'model-one', []),
          profile('p2', '自定义', 'model-two', []),
        ]}
        selection={{ profileId: 'p1', model: 'model-one' }}
        onChange={(value) => changes.push(value)}
      />,
    ));

    act(() => (container.querySelector('[aria-label="选择聊天模型"]') as HTMLButtonElement).click());
    expect(container.querySelectorAll('.chat-model-group')).toHaveLength(2);
    act(() => (container.querySelectorAll('.chat-model-group button')[1] as HTMLButtonElement).click());
    expect(changes).toEqual([{ profileId: 'p2', model: 'model-two' }]);
  });

  test('shows a disabled selection prompt when no chat model exists', () => {
    act(() => root.render(
      <ChatModelMenu profiles={[]} selection={{ model: '' }} onChange={() => undefined} />,
    ));
    const trigger = container.querySelector('[aria-label="选择聊天模型"]') as HTMLButtonElement;
    expect(trigger.textContent).toContain('选择模型');
    expect(trigger.disabled).toBe(true);
  });

  test('shows an enabled selection prompt instead of a stale model when choices exist', () => {
    act(() => root.render(
      <ChatModelMenu
        profiles={[profile('p1', 'DeepSeek', 'current-model', [])]}
        selection={{ profileId: 'p1', model: 'removed-model' }}
        onChange={() => undefined}
      />,
    ));
    const trigger = container.querySelector('[aria-label="选择聊天模型"]') as HTMLButtonElement;
    expect(trigger.textContent).toContain('选择模型');
    expect(trigger.textContent).not.toContain('removed-model');
    expect(trigger.disabled).toBe(false);
  });
});
