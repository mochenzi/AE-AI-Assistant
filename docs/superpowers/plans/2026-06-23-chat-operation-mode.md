# Chat and AE Operation Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让聊天默认进行自然问答，并通过持久化的“操作 AE”模式显式启用动作规划，同时彻底隐藏模型内部 JSON 信封。

**Architecture:** 共享响应层定义两种系统提示词和一个安全降级的信封解析器；持久化状态保存当前聊天模式；聊天页面根据模式构造请求、缓冲原始流并只展示解析后的自然语言或动作预览。现有动作 Schema、工程 revision 校验、一次确认及危险操作二次确认保持不变。

**Tech Stack:** React 18、TypeScript、Vite、CEP Runtime、Vitest、Playwright Python

---

## File Structure

- Modify: `src/shared/actionResponse.ts` — 定义聊天/操作提示词、内部响应信封类型和安全解析入口。
- Modify: `src/shared/appState.ts` — 在本地应用状态中保存 `chatMode`。
- Modify: `src/shared/stateMigration.ts` — 为旧数据补齐安全的普通对话默认模式。
- Modify: `src/ui/App.tsx` — 增加模式菜单，按模式发请求，缓冲并隐藏内部 JSON。
- Modify: `src/context-manager.css` — 为模式按钮、菜单、状态标签和等待状态添加 CEP 兼容样式。
- Modify: `tests/action-response.test.ts` — 覆盖两类信封、纯文本回退和无效动作降级。
- Modify: `tests/state-migration.test.ts` — 覆盖默认模式、合法模式保留和非法值修复。
- Modify: `tests/e2e_redesign.py` — 覆盖模式切换、导航保持和页面重载持久化。

### Task 1: Add a Safe Assistant Response Envelope

**Files:**
- Modify: `src/shared/actionResponse.ts`
- Test: `tests/action-response.test.ts`

- [ ] **Step 1: Replace the parser tests with failing envelope behavior tests**

```ts
import { describe, expect, test } from 'vitest';
import { parseAssistantResponse } from '../src/shared/actionResponse';

const validPlan = {
  version: 'ae-actions/v1', summary: '读取当前工程', risk: 'low',
  projectRevision: 'r1', actions: [{ type: 'project.context' }],
};

describe('assistant response parser', () => {
  test('unwraps a natural-language chat response', () => {
    expect(parseAssistantResponse(JSON.stringify({ kind: 'chat', message: '我是你当前选择的 AI 模型。' })))
      .toEqual({ kind: 'chat', visibleText: '我是你当前选择的 AI 模型。' });
  });

  test('unwraps and validates an AE action plan', () => {
    const result = parseAssistantResponse(`\`\`\`json\n${JSON.stringify({ kind: 'ae_action', plan: validPlan })}\n\`\`\``);
    expect(result.kind).toBe('ae_action');
    expect(result.visibleText).toBe('已生成 AE 动作预览：读取当前工程');
    if (result.kind === 'ae_action') expect(result.plan.summary).toBe('读取当前工程');
  });

  test('treats ordinary model text as a safe chat fallback', () => {
    expect(parseAssistantResponse('请告诉我需要修改哪个图层。'))
      .toEqual({ kind: 'chat', visibleText: '请告诉我需要修改哪个图层。' });
  });

  test('does not expose an invalid action as executable', () => {
    const raw = JSON.stringify({ kind: 'ae_action', plan: { ...validPlan, version: 'ae-actions/v2' } });
    const result = parseAssistantResponse(raw);
    expect(result.kind).toBe('chat');
    expect(result.visibleText).toBe('AI 返回的 AE 动作计划无效，未生成可执行操作。');
  });

  test('does not display an unknown JSON envelope', () => {
    const result = parseAssistantResponse('{"action":"project.context"}');
    expect(result).toEqual({ kind: 'chat', visibleText: 'AI 返回格式无法识别，请重试。' });
  });
});
```

- [ ] **Step 2: Run the focused test and verify that the new API is missing**

Run: `npm test -- tests/action-response.test.ts`

Expected: FAIL because `parseAssistantResponse` is not exported.

- [ ] **Step 3: Implement the prompts and discriminated response parser**

```ts
import { validateActionPlan, type AeActionPlan } from './actionProtocol';

export type AssistantResponse =
  | { kind: 'chat'; visibleText: string }
  | { kind: 'ae_action'; visibleText: string; plan: AeActionPlan };

function jsonCandidate(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  return fenced ?? (first >= 0 && last > first ? text.slice(first, last + 1) : '');
}

export function parseAssistantResponse(text: string): AssistantResponse {
  const raw = text.trim();
  let value: unknown;
  try { value = JSON.parse(jsonCandidate(raw)); }
  catch { return { kind: 'chat', visibleText: raw || 'AI 没有返回内容。' }; }

  if (value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'chat') {
    const message = (value as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return { kind: 'chat', visibleText: message.trim() };
    }
    return { kind: 'chat', visibleText: 'AI 没有返回可显示的回复。' };
  }

  if (value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'ae_action') {
    const result = validateActionPlan((value as { plan?: unknown }).plan);
    if (result.ok) {
      return {
        kind: 'ae_action',
        visibleText: `已生成 AE 动作预览：${result.value.summary}`,
        plan: result.value,
      };
    }
    return { kind: 'chat', visibleText: 'AI 返回的 AE 动作计划无效，未生成可执行操作。' };
  }

  return { kind: 'chat', visibleText: 'AI 返回格式无法识别，请重试。' };
}

const ENVELOPE_RULE = `只返回一个 JSON 对象，不要使用 Markdown。自然语言回答使用 {"kind":"chat","message":"回答内容"}。`;

export const CHAT_SYSTEM_PROMPT = `你是 AE AI Assistant，也是一名正常的中文 AI 助手。${ENVELOPE_RULE}\n当前处于普通对话模式：只允许返回 kind 为 chat；不得创建、建议执行或伪装成 AE 动作计划。`;

export const AE_OPERATION_SYSTEM_PROMPT = `你是 After Effects 操作助手。${ENVELOPE_RULE}\n当前处于操作 AE 模式：信息不足时返回 kind 为 chat 并自然追问；信息完整时返回 {"kind":"ae_action","plan":<ae-actions/v1 对象>}。允许动作：project.context、comp.create、layer.text.create、layer.shape.create、layer.solid.create、property.set、keyframe.set、keyframe.delete、expression.set、effect.add、effect.parameter.set、footage.import、layer.delete。动作计划必须使用用户提供的 projectRevision。不得生成脚本、不得删除工程素材/合成/磁盘文件。删除图层或关键帧时 risk 必须为 high。所有动作只生成预览，不声称已经执行。`;
```

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `npm test -- tests/action-response.test.ts`

Expected: 5 tests PASS.

- [ ] **Step 5: Commit the response protocol**

```bash
git add src/shared/actionResponse.ts tests/action-response.test.ts
git commit -m "feat: separate chat and AE assistant responses"
```

### Task 2: Persist the Selected Chat Mode

**Files:**
- Modify: `src/shared/appState.ts`
- Modify: `src/shared/stateMigration.ts`
- Test: `tests/state-migration.test.ts`

- [ ] **Step 1: Add failing state migration assertions**

Add these assertions/tests to `tests/state-migration.test.ts`:

```ts
expect(migrated.chatMode).toBe('chat');

test('preserves AE mode and repairs unsupported mode values', () => {
  expect(migrateState({ chatMode: 'ae' }).chatMode).toBe('ae');
  expect(migrateState({ chatMode: 'unexpected' } as never).chatMode).toBe('chat');
});
```

- [ ] **Step 2: Run the migration test and verify it fails**

Run: `npm test -- tests/state-migration.test.ts`

Expected: FAIL because `chatMode` is missing from `AppState` and migrated state.

- [ ] **Step 3: Add the state type, default and migration guard**

Add to `src/shared/appState.ts`:

```ts
export type ChatMode = 'chat' | 'ae';

export interface AppState {
  // existing fields remain unchanged
  chatMode: ChatMode;
}
```

Add `chatMode: 'chat'` to `createDefaultState()`. In `src/shared/stateMigration.ts`, place this after the spread fields in the returned object so malformed stored data cannot overwrite it:

```ts
chatMode: source.chatMode === 'ae' ? 'ae' : 'chat',
```

- [ ] **Step 4: Run migration and full unit tests**

Run: `npm test -- tests/state-migration.test.ts`

Expected: all state migration tests PASS.

Run: `npm test`

Expected: all Vitest suites PASS.

- [ ] **Step 5: Commit mode persistence**

```bash
git add src/shared/appState.ts src/shared/stateMigration.ts tests/state-migration.test.ts
git commit -m "feat: persist chat operation mode"
```

### Task 3: Add the Composer Mode Menu and Hide Protocol Streaming

**Files:**
- Modify: `src/ui/App.tsx`
- Modify: `src/context-manager.css`

- [ ] **Step 1: Update imports and derive the active prompt from persisted state**

Replace the old action response imports in `src/ui/App.tsx`:

```ts
import {
  AE_OPERATION_SYSTEM_PROMPT,
  CHAT_SYSTEM_PROMPT,
  parseAssistantResponse,
} from '../shared/actionResponse';
```

Inside `ChatPage`, add:

```ts
const [modeMenuOpen, setModeMenuOpen] = useState(false);
const systemPrompt = state.chatMode === 'ae'
  ? AE_OPERATION_SYSTEM_PROMPT
  : CHAT_SYSTEM_PROMPT;
```

Use `systemPrompt` in both token estimation and the outgoing messages array instead of `ACTION_SYSTEM_PROMPT`.

- [ ] **Step 2: Buffer raw streaming data and persist only visible text**

Delete the `stream` React state and every `setStream(...)` call. Replace the raw stream update and completion parsing in `send()` with:

```ts
if (event.type === 'text') {
  text += event.text;
}
```

After `runtime.chat` completes:

```ts
const response = parseAssistantResponse(text);
setPlan(response.kind === 'ae_action' ? response.plan : null);
```

Store the assistant message as:

```ts
{ role: 'assistant' as const, content: response.visibleText, usage },
```

Replace the raw streaming article with a protocol-safe waiting indicator:

```tsx
{busy && (
  <article className="message assistant pending-response" aria-live="polite">
    <small>AI</small>
    <p><LoaderCircle className="spin" size={14} /> 正在思考…</p>
  </article>
)}
```

- [ ] **Step 3: Add the persistent mode control beside the input**

Add this inside `.composer`, before the textarea:

```tsx
<div className="chat-mode-control">
  <button
    type="button"
    className="chat-mode-trigger"
    aria-label="选择对话模式"
    aria-expanded={modeMenuOpen}
    onClick={() => setModeMenuOpen((open) => !open)}
  >
    <Plus size={16} />
  </button>
  {modeMenuOpen && (
    <div className="chat-mode-menu" role="menu">
      {([
        ['chat', '普通对话'],
        ['ae', '操作 AE'],
      ] as const).map(([value, label]) => (
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
<span className={`chat-mode-chip ${state.chatMode}`}>
  {state.chatMode === 'ae' ? '操作 AE' : '普通对话'}
</span>
```

Change the empty-state title, description, placeholder and footer according to `state.chatMode`; the AE description must say actions are previewed before execution, while chat mode must say it will answer normally and not operate AE.

- [ ] **Step 4: Add compact CEP-safe positioning and feedback styles**

Append to `src/context-manager.css`:

```css
.conversation-frame .composer {
  position: relative;
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  align-items: end;
  gap: 7px;
}
.composer textarea { grid-column: 3; }
.composer .send { grid-column: 4; }
.composer > small { grid-column: 1 / -1; }
.chat-mode-control { position: relative; align-self: end; }
.chat-mode-trigger { width: 30px; height: 30px; padding: 0; display: grid; place-items: center; }
.chat-mode-menu {
  position: absolute; left: 0; bottom: calc(100% + 7px); z-index: 20;
  width: 116px; padding: 4px; display: grid; gap: 3px;
  border: 1px solid #4b5a51; background: #111713; box-shadow: 0 8px 22px #000a;
}
.chat-mode-menu button { padding: 7px 8px; text-align: left; font-size: 9px; }
.chat-mode-menu button[aria-checked="true"] { color: var(--acid); background: #263229; }
.chat-mode-chip {
  align-self: end; margin-bottom: 7px; padding: 3px 6px; white-space: nowrap;
  border: 1px solid #46534b; color: var(--muted); font-size: 8px;
}
.chat-mode-chip.ae { border-color: #7c9c2d; color: var(--acid); }
.pending-response p { display: flex; align-items: center; gap: 6px; color: var(--muted); }
```

- [ ] **Step 5: Run type checking, unit tests and production builds**

Run: `npm run check`

Expected: every Vitest suite passes; both TypeScript projects and both Vite builds complete successfully.

- [ ] **Step 6: Commit the chat interface behavior**

```bash
git add src/ui/App.tsx src/context-manager.css
git commit -m "feat: add persistent chat and AE mode control"
```

### Task 4: Verify Persistence, Safety and AE Installation

**Files:**
- Modify: `tests/e2e_redesign.py`

- [ ] **Step 1: Add end-to-end checks for mode selection and persistence**

Add after the initial chat-page assertions in `tests/e2e_redesign.py`:

```py
expect(page.get_by_text("普通对话", exact=True)).to_be_visible()
page.get_by_role("button", name="选择对话模式", exact=True).click()
page.get_by_role("menuitemradio", name="操作 AE", exact=True).click()
expect(page.locator(".chat-mode-chip.ae")).to_have_text("操作 AE")
expect(page.get_by_text("所有 AE 动作都会先生成预览", exact=False)).to_be_visible()

page.get_by_role("button", name="生成", exact=True).click()
page.get_by_role("button", name="对话", exact=True).click()
expect(page.locator(".chat-mode-chip.ae")).to_have_text("操作 AE")

page.reload()
page.wait_for_load_state("networkidle")
expect(page.locator(".chat-mode-chip.ae")).to_have_text("操作 AE")
```

- [ ] **Step 2: Start the preview server and run both browser checks**

Run in terminal 1: `npm run dev -- --host 127.0.0.1`

Run in terminal 2: `python tests/e2e_preview.py`

Expected: exit code 0.

Run in terminal 2: `python tests/e2e_redesign.py`

Expected: exit code 0; the mode remains “操作 AE” after navigation and reload.

- [ ] **Step 3: Run the complete validation suite**

Run: `npm run check`

Expected: all tests, TypeScript checks and builds PASS.

- [ ] **Step 4: Install the validated build into AE CEP extensions**

Run: `npm run install:ae`

Expected: production files are built and copied into the current user's CEP extensions directory without errors.

- [ ] **Step 5: Inspect the final diff for credentials and protocol leaks**

Run: `git diff --check; rg -n '(?i)(api[_-]?key|token|password)\s*[:=]\s*\S{20,}|Bearer\s+[A-Za-z0-9_-]{24,}|(?:sk|api)[_-][A-Za-z0-9]{24,}' src tests docs`

Expected: `git diff --check` has no output; `rg` finds no password and no obsolete parser/prompt references.

- [ ] **Step 6: Commit end-to-end coverage**

```bash
git add tests/e2e_redesign.py
git commit -m "test: cover persistent AE chat mode"
```

- [ ] **Step 7: Push the completed branch**

Run: `git push origin master`

Expected: local `master` is pushed successfully to `mochenzi/AE-AI-Assistant`.
