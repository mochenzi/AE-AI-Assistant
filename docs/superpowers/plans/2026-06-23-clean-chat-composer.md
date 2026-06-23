# Clean Chat Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将聊天页改成 Codex 风格的一体式输入框，把模式、上下文与模型选择集中到底栏，并移除所有常驻 Token 显示和旧工具栏。

**Architecture:** 新建独立的 `ChatModelMenu` 组件，把聊天供应商与模型合并为一个分组菜单；`ChatPage` 保留请求、动作和归档逻辑，只重组空状态、上下文菜单、临界警告与输入框。Token 预算继续在后台计算，只有 warning/blocked 状态才渲染紧凑提示。

**Tech Stack:** React 18、TypeScript、Vite、CEP、Vitest、jsdom、Playwright Python

---

## File Structure

- Create: `src/ui/ChatModelMenu.tsx` — 收集聊天模型、按供应商分组、展示当前模型并发送组合选择。
- Create: `tests/chat-model-menu.test.tsx` — 覆盖模型去重、分组选择和空状态。
- Modify: `src/ui/App.tsx` — 删除旧聊天工具栏，增加居中空状态、一体式 composer、上下文菜单和临界提示。
- Modify: `src/context-manager.css` — 实现大圆角输入框、弹出菜单、居中空状态及窄面板适配。
- Modify: `tests/e2e_preview.py` — 更新默认聊天页文案并验证干净结构。
- Modify: `tests/e2e_redesign.py` — 验证组合模型、上下文菜单、空状态消失和 Token 隐藏。

### Task 1: Build the Grouped Chat Model Menu

**Files:**
- Create: `src/ui/ChatModelMenu.tsx`
- Create: `tests/chat-model-menu.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `tests/chat-model-menu.test.tsx`:

```tsx
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
      profile('p2', '豆包', 'doubao-pro', []),
    ])).toEqual([
      { profileId: 'p1', profileName: 'DeepSeek', model: 'deepseek-chat' },
      { profileId: 'p1', profileName: 'DeepSeek', model: 'deepseek-reasoner' },
      { profileId: 'p2', profileName: '豆包', model: 'doubao-pro' },
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

    act(() => (container.querySelector('[aria-label="选择聊天模型"]') as HTMLButtonElement).click());
    expect(container.textContent).toContain('DeepSeek');
    expect(container.querySelectorAll('[role="menuitemradio"]')).toHaveLength(2);
    act(() => (container.querySelectorAll('[role="menuitemradio"]')[1] as HTMLButtonElement).click());
    expect(changes).toEqual([{ profileId: 'p1', model: 'deepseek-reasoner' }]);
  });

  test('shows a disabled selection prompt when no chat model exists', () => {
    act(() => root.render(
      <ChatModelMenu profiles={[]} selection={{ model: '' }} onChange={() => undefined} />,
    ));
    const trigger = container.querySelector('[aria-label="选择聊天模型"]') as HTMLButtonElement;
    expect(trigger.textContent).toContain('选择模型');
    expect(trigger.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/chat-model-menu.test.tsx`

Expected: FAIL because `src/ui/ChatModelMenu.tsx` does not exist.

- [ ] **Step 3: Implement the grouped menu**

Create `src/ui/ChatModelMenu.tsx`:

```tsx
import { Check, ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { profilesForCapability } from '../shared/modelSelection';
import type { ApiProfile } from '../shared/types';

export interface ChatModelChoice {
  profileId: string;
  profileName: string;
  model: string;
}

export function collectChatModelChoices(profiles: ApiProfile[]): ChatModelChoice[] {
  return profilesForCapability(profiles, 'chat').flatMap((profile) => {
    const ids = new Set<string>();
    const configured = profile.chat?.model.trim();
    if (configured) ids.add(configured);
    for (const item of profile.cachedModels ?? []) {
      const id = item.id.trim();
      if (id) ids.add(id);
    }
    return [...ids].map((model) => ({
      profileId: profile.id,
      profileName: profile.name,
      model,
    }));
  });
}

export function ChatModelMenu({
  profiles,
  selection,
  onChange,
}: {
  profiles: ApiProfile[];
  selection: { profileId?: string; model: string };
  onChange: (value: { profileId: string; model: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const choices = useMemo(() => collectChatModelChoices(profiles), [profiles]);
  const groups = useMemo(() => {
    const result = new Map<string, ChatModelChoice[]>();
    for (const choice of choices) {
      const current = result.get(choice.profileName) ?? [];
      current.push(choice);
      result.set(choice.profileName, current);
    }
    return result;
  }, [choices]);
  const selected = choices.find(
    ({ profileId, model }) => profileId === selection.profileId && model === selection.model,
  );

  return (
    <div className="chat-model-menu">
      <button
        type="button"
        className="composer-control model-control"
        aria-label="选择聊天模型"
        aria-expanded={open}
        disabled={choices.length === 0}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{selected?.model || selection.model || '选择模型'}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="composer-popover model-popover" role="menu">
          {[...groups].map(([profileName, items]) => (
            <section key={profileName} className="chat-model-group">
              <small>{profileName}</small>
              {items.map((choice) => {
                const active = choice.profileId === selection.profileId && choice.model === selection.model;
                return (
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    key={`${choice.profileId}:${choice.model}`}
                    onClick={() => {
                      onChange({ profileId: choice.profileId, model: choice.model });
                      setOpen(false);
                    }}
                  >
                    <span>{choice.model}</span>
                    {active && <Check size={12} />}
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- tests/chat-model-menu.test.tsx`

Expected: 3 tests PASS.

- [ ] **Step 5: Commit the model menu**

```bash
git add src/ui/ChatModelMenu.tsx tests/chat-model-menu.test.tsx
git commit -m "feat: add grouped chat model menu"
```

### Task 2: Replace the Chat Toolbar with the Integrated Composer

**Files:**
- Modify: `src/ui/App.tsx:275-718`
- Modify: `src/context-manager.css`
- Modify: `tests/e2e_preview.py`
- Modify: `tests/e2e_redesign.py`

- [ ] **Step 1: Add failing browser assertions for the clean layout**

In `tests/e2e_preview.py`, replace the initial chat assertion with:

```py
    assert page.get_by_text("你好", exact=True).is_visible()
    assert page.get_by_text("今天想制作什么？", exact=True).is_visible()
    assert page.locator(".empty-mark.centered").is_visible()
    assert page.locator(".context-compact").count() == 0
    assert page.locator(".conversation-toolbar").count() == 0
    assert page.locator(".chat-layout").get_by_text("tokens", exact=False).count() == 0
    assert page.get_by_role("button", name="更多对话选项", exact=True).is_visible()
    assert page.get_by_role("button", name="选择聊天模型", exact=True).is_visible()
```

At the beginning of `tests/e2e_redesign.py`, replace the old `.model-switcher` and `.context-compact` assertions with the same absence checks and add:

```py
    expect(page.locator(".empty-mark.centered")).to_contain_text("你好")
```

- [ ] **Step 2: Run the browser test and verify RED**

Start the preview server: `npm run dev -- --host 127.0.0.1`

Run: `python tests/e2e_preview.py`

Expected: FAIL because the old Token bar and conversation toolbar still exist.

- [ ] **Step 3: Recompose `ChatPage` state**

Import `ChatModelMenu` in `src/ui/App.tsx`:

```tsx
import { ChatModelMenu } from './ChatModelMenu';
```

Replace `contextEditor` state with the following menu state while retaining `modeMenuOpen`:

```tsx
const [plusMenuOpen, setPlusMenuOpen] = useState(false);
const [contextPickerOpen, setContextPickerOpen] = useState(false);
const [contextEditor, setContextEditor] = useState(false);
const hasMessages = Boolean(conversation?.messages.length);
```

- [ ] **Step 4: Replace the old top bars and empty state**

Delete the `.context-bar.context-compact`, `.context-pills`, top-level `ContextEditor`, and `.conversation-toolbar` JSX. The beginning of `.conversation-frame` becomes:

```tsx
<div className="conversation-frame clean-chat">
  <div className="conversation">
    {state.chatMode === 'ae' && (
      <div className="ae-project-status">
        {project.activeComp
          ? `${project.activeComp.name} · AE 已连接`
          : '未选择活动合成'}
      </div>
    )}
    {!hasMessages && !busy && (
      <div className="empty-mark centered">
        <b>你好</b>
        <span>今天想制作什么？</span>
      </div>
    )}
```

Delete the `message.usage` `<em>` block so no per-message Token values are rendered. Keep message text, waiting indicator, action preview and confirmation unchanged.

- [ ] **Step 5: Build the integrated composer JSX**

Replace the current `.composer` block with:

```tsx
<div className="composer-shell">
  {(budget.level === 'warning' || budget.level === 'blocked') && (
    <div className={`context-warning ${budget.level}`}>
      <span>{budget.level === 'blocked' ? '上下文已接近上限，请压缩后继续。' : '上下文将满，可压缩后继续。'}</span>
      <button disabled={busy} onClick={archiveWithSummary}>
        {busy ? '归档中…' : '压缩并续聊'}
      </button>
    </div>
  )}
  {contextEditor && (
    <div className="composer-context-editor">
      <ContextEditor state={state} update={update} />
      <button type="button" onClick={() => setContextEditor(false)}>完成</button>
    </div>
  )}
  <div className="composer codex-composer">
    <textarea
      value={prompt}
      onChange={(event) => setPrompt(event.target.value)}
      placeholder={state.chatMode === 'ae' ? '描述想在 AE 中完成的操作…' : '输入问题，和 AI 正常对话…'}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) send();
      }}
    />
    <div className="composer-controls">
      <div className="composer-menu-anchor">
        <button
          type="button"
          className="composer-icon-button"
          aria-label="更多对话选项"
          aria-expanded={plusMenuOpen}
          onClick={() => setPlusMenuOpen((open) => !open)}
        >
          <Plus size={16} />
        </button>
        {plusMenuOpen && (
          <div className="composer-popover context-popover" role="menu">
            <button type="button" onClick={() => setContextPickerOpen((open) => !open)}>
              <FileText size={14} /> 上下文档案
            </button>
            {contextPickerOpen && (
              <div className="composer-context-list">
                {state.contexts.length === 0 && <small>还没有上下文档案</small>}
                {state.contexts.map((item) => (
                  <label key={item.id}>
                    <input
                      type="checkbox"
                      checked={selectedContexts.includes(item.id)}
                      onChange={() => setSelectedContexts((ids) =>
                        ids.includes(item.id)
                          ? ids.filter((id) => id !== item.id)
                          : [...ids, item.id],
                      )}
                    />
                    {item.name}
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setContextEditor(true);
                    setPlusMenuOpen(false);
                  }}
                >
                  管理上下文档案
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="composer-menu-anchor">
        <button
          type="button"
          className={`composer-control mode-control ${state.chatMode}`}
          aria-label="选择对话模式"
          aria-expanded={modeMenuOpen}
          onClick={() => setModeMenuOpen((open) => !open)}
        >
          {state.chatMode === 'ae' ? '操作 AE' : '普通对话'}
        </button>
        {modeMenuOpen && (
          <div className="composer-popover mode-popover" role="menu">
            {([['chat', '普通对话'], ['ae', '操作 AE']] as const).map(([value, label]) => (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={state.chatMode === value}
                key={value}
                onClick={() => {
                  update((current) => ({ ...current, chatMode: value }));
                  setModeMenuOpen(false);
                  setPlan(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <ChatModelMenu
        profiles={state.profiles}
        selection={{ profileId: chatSelection.profileId, model: chatSelection.model }}
        onChange={(selection) => update((current) => ({
          ...current,
          activeSelections: setActiveSelection(current.activeSelections, 'chat', selection),
        }))}
      />
      {selectedContexts.length > 0 && (
        <span className="context-count">上下文 {selectedContexts.length}</span>
      )}
      <button
        className="send"
        aria-label="发送消息"
        disabled={busy || !prompt.trim() || budget.level === 'blocked' || !profile}
        onClick={send}
      >
        {busy ? <LoaderCircle className="spin" /> : <Send />}
      </button>
    </div>
    {!profile && <small className="composer-hint">请先在 API 页面保存聊天模型</small>}
  </div>
</div>
```

- [ ] **Step 6: Add the Codex-style responsive CSS**

Replace the chat/composer overrides in `src/context-manager.css` with:

```css
.chat-layout { display: flex; flex-direction: column; min-height: 0; padding-top: 10px; }
.chat-layout .conversation-frame.clean-chat {
  flex: 1 1 auto;
  min-height: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  overflow: visible;
}
.clean-chat .conversation { position: relative; padding: 8px 12px 18px; }
.empty-mark.centered {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 0;
  text-align: center;
}
.empty-mark.centered b { color: var(--acid); font-size: 23px; }
.empty-mark.centered span { margin-top: 7px; color: var(--muted); font-size: 11px; }
.ae-project-status { color: #66736b; font-size: 8px; letter-spacing: .08em; }
.composer-shell { position: relative; padding: 0 12px 12px; }
.context-warning {
  margin: 0 4px 7px;
  padding: 7px 9px;
  border: 1px solid #6e6532;
  background: #292615;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #e7d77d;
  font-size: 9px;
}
.context-warning.blocked { border-color: #70413d; color: #ff9489; }
.context-warning button { border: 0; background: transparent; color: inherit; text-decoration: underline; }
.codex-composer {
  border: 1px solid #3c4740;
  border-radius: 15px;
  padding: 11px;
  background: #161d18;
  box-shadow: 0 12px 28px #0006, inset 0 1px #2b352e;
}
.codex-composer textarea {
  display: block;
  width: 100%;
  min-height: 64px;
  max-height: 180px;
  padding: 2px 3px 9px;
  border: 0;
  background: transparent;
  resize: vertical;
}
.composer-controls { display: flex; align-items: center; gap: 6px; min-width: 0; }
.composer-menu-anchor, .chat-model-menu { position: relative; min-width: 0; }
.composer-icon-button, .composer-control {
  height: 27px;
  border: 1px solid #465149;
  border-radius: 8px;
  background: #111713;
  color: #aab3ad;
}
.composer-icon-button { width: 27px; padding: 0; display: grid; place-items: center; border-radius: 50%; }
.composer-control { padding: 0 8px; display: flex; align-items: center; gap: 4px; font-size: 9px; }
.model-control { max-width: 150px; }
.model-control span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mode-control.ae { border-color: #789b2e; color: var(--acid); }
.composer-popover {
  position: absolute;
  left: 0;
  bottom: calc(100% + 7px);
  z-index: 30;
  min-width: 150px;
  max-height: 240px;
  overflow: auto;
  padding: 5px;
  border: 1px solid #465149;
  border-radius: 10px;
  background: #101612;
  box-shadow: 0 12px 28px #000b;
}
.composer-popover button, .composer-context-list label {
  width: 100%;
  padding: 7px 8px;
  border: 0;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 7px;
  color: #c8d0cb;
  text-align: left;
  font-size: 9px;
}
.composer-popover button:hover, .composer-popover button[aria-checked="true"] { background: #253027; color: var(--acid); }
.chat-model-group > small { display: block; padding: 6px 8px 3px; color: #69746d; font-size: 8px; }
.context-count { color: var(--cyan); font-size: 8px; white-space: nowrap; }
.codex-composer .send {
  position: static;
  margin-left: auto;
  width: 29px;
  height: 29px;
  border-radius: 50%;
}
.composer-hint { position: static; display: block; margin-top: 7px; color: #7b837e; font-size: 8px; }
.composer-context-editor { position: absolute; left: 12px; right: 12px; bottom: calc(100% + 8px); z-index: 25; }
@media (max-width: 520px) {
  .model-control { max-width: 105px; }
  .context-count { display: none; }
  .composer-shell { padding-inline: 8px; }
}
```

- [ ] **Step 7: Run browser tests and full checks**

Run: `python tests/e2e_preview.py`

Expected: PASS.

Run: `npm run check`

Expected: all Vitest tests, TypeScript checks and Vite builds PASS.

- [ ] **Step 8: Commit the clean composer**

```bash
git add src/ui/App.tsx src/context-manager.css tests/e2e_preview.py tests/e2e_redesign.py
git commit -m "feat: redesign the chat composer"
```

### Task 3: Verify Model, Context and Empty-State Interactions

**Files:**
- Modify: `tests/e2e_redesign.py`

- [ ] **Step 1: Extend the end-to-end interaction test**

After the API profile has synchronized `preview-model` and been saved, return to chat and add:

```py
    page.get_by_role("button", name="对话", exact=True).click()
    page.get_by_role("button", name="选择聊天模型", exact=True).click()
    expect(page.get_by_text("OpenAI", exact=True)).to_be_visible()
    page.get_by_role("menuitemradio", name="preview-model", exact=True).click()
    expect(page.get_by_role("button", name="选择聊天模型", exact=True)).to_contain_text("preview-model")

    page.get_by_role("button", name="更多对话选项", exact=True).click()
    page.get_by_role("button", name="上下文档案", exact=True).click()
    page.get_by_role("button", name="管理上下文档案", exact=True).click()
    page.locator(".inline-editor input").fill("项目背景")
    page.locator(".inline-editor textarea").fill("品牌色为绿色。")
    page.get_by_role("button", name="保存 MD 档案", exact=True).click()
    page.get_by_role("button", name="完成", exact=True).click()

    page.get_by_role("button", name="更多对话选项", exact=True).click()
    page.get_by_role("button", name="上下文档案", exact=True).click()
    page.get_by_text("项目背景", exact=True).click()
    expect(page.locator(".context-count")).to_have_text("上下文 1")

    page.locator(".codex-composer textarea").fill("你好")
    page.get_by_role("button", name="发送消息", exact=True).click()
    expect(page.locator(".empty-mark.centered")).to_have_count(0)
    expect(page.locator(".message em")).to_have_count(0)
```

- [ ] **Step 2: Run the extended browser test**

Run: `python tests/e2e_redesign.py`

Expected: PASS; the model changes, context count appears, and the centered greeting disappears after send.

- [ ] **Step 3: Verify Token warning remains conditional**

Add these assertions before typing the normal message:

```py
    expect(page.locator(".context-warning")).to_have_count(0)
```

Then use a large prompt to trigger the blocked state and verify the safety UI:

```py
    page.locator(".codex-composer textarea").fill("请继续分析。" * 20000)
    expect(page.locator(".context-warning")).to_be_visible()
    expect(page.get_by_role("button", name="发送消息", exact=True)).to_be_disabled()
    page.locator(".codex-composer textarea").fill("你好")
```

Run: `python tests/e2e_redesign.py`

Expected: PASS; warning is hidden normally and appears only near/over the limit.

- [ ] **Step 4: Commit interaction coverage**

```bash
git add tests/e2e_redesign.py
git commit -m "test: cover clean chat composer interactions"
```

### Task 4: Final Validation, AE Installation and GitHub Delivery

**Files:**
- Verify only; no source file changes expected.

- [ ] **Step 1: Run the full automated suite**

Run: `npm run check`

Expected: every Vitest suite passes; both TypeScript projects and Vite builds complete successfully.

- [ ] **Step 2: Run both browser acceptance tests**

Run: `python tests/e2e_preview.py`

Expected: exit code 0 with no browser console errors.

Run: `python tests/e2e_redesign.py`

Expected: exit code 0.

- [ ] **Step 3: Install the validated build into AE**

Run: `npm run install:ae`

Expected: build completes and the extension is copied to the current user's CEP extension directory.

- [ ] **Step 4: Inspect the final diff and scan secrets**

Run: `git diff --check; rg -n '(?i)(api[_-]?key|token|password)\s*[:=]\s*\S{20,}|Bearer\s+[A-Za-z0-9_-]{24,}|(?:sk|api)[_-][A-Za-z0-9]{24,}' src tests docs`

Expected: `git diff --check` has no output and the scan finds no high-signal credential patterns.

- [ ] **Step 5: Complete the feature branch workflow**

Use `superpowers:finishing-a-development-branch`, choose the approved integration option, verify the merged result, and push `master` to `origin` when authorized.
