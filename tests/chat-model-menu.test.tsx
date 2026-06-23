// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, test } from 'vitest';
import { ChatModelMenu, collectChatModelChoices } from '../src/ui/ChatModelMenu';
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
      profile('p2', '璞嗗寘', 'doubao-pro', []),
    ])).toEqual([
      { profileId: 'p1', profileName: 'DeepSeek', model: 'deepseek-chat' },
      { profileId: 'p1', profileName: 'DeepSeek', model: 'deepseek-reasoner' },
      { profileId: 'p2', profileName: '璞嗗寘', model: 'doubao-pro' },
    ]);
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

    act(() => (container.querySelector('[aria-label="閫夋嫨鑱婂ぉ妯″瀷"]') as HTMLButtonElement).click());
    expect(container.textContent).toContain('DeepSeek');
    expect(container.querySelectorAll('[role="menuitemradio"]')).toHaveLength(2);
    act(() => (container.querySelectorAll('[role="menuitemradio"]')[1] as HTMLButtonElement).click());
    expect(changes).toEqual([{ profileId: 'p1', model: 'deepseek-reasoner' }]);
  });

  test('shows a disabled selection prompt when no chat model exists', () => {
    act(() => root.render(
      <ChatModelMenu profiles={[]} selection={{ model: '' }} onChange={() => undefined} />,
    ));
    const trigger = container.querySelector('[aria-label="閫夋嫨鑱婂ぉ妯″瀷"]') as HTMLButtonElement;
    expect(trigger.textContent).toContain('閫夋嫨妯″瀷');
    expect(trigger.disabled).toBe(true);
  });
});
