// @vitest-environment jsdom

import React, { act } from 'react';
import { afterEach, describe, expect, test } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { ConversationDrawer } from '../src/ui/ConversationDrawer';

describe('ConversationDrawer', () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
  });

  test('renders rename as a separate button instead of nested interactive markup', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    act(() => root?.render(
      <ConversationDrawer
        open
        project={{ key: 'project', label: 'intro.aep', unsaved: false }}
        conversations={[{
          id: 'c1',
          project: { key: 'project', label: 'intro.aep', unsaved: false },
          title: 'First chat',
          createdAt: '2026-06-24T00:00:00.000Z',
          updatedAt: '2026-06-24T00:00:00.000Z',
        }]}
        activeId="c1"
        search=""
        onToggle={() => undefined}
        onNew={() => undefined}
        onSearch={() => undefined}
        onSelect={() => undefined}
        onRename={() => undefined}
      />,
    ));

    const item = container.querySelector('.conversation-item');
    const main = container.querySelector('.conversation-item-main');
    const rename = container.querySelector('[title="重命名会话"]');

    expect(item?.tagName).not.toBe('BUTTON');
    expect(main?.tagName).toBe('BUTTON');
    expect(rename?.tagName).toBe('BUTTON');
    expect(main?.contains(rename)).toBe(false);
  });
});
