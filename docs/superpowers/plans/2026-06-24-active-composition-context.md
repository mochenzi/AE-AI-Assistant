# Active Composition Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users attach a fresh, bounded, text-only snapshot of the active AE composition to a conversation from the composer `+` menu.

**Architecture:** ExtendScript collects a versioned read-only snapshot with per-property fault isolation. A shared serializer prioritizes selected layers and enforces a 25% context budget before React injects the text into the model request.

**Tech Stack:** ExtendScript, TypeScript, React, CEP bridge, js-tiktoken, Vitest

---

### Task 1: Define the versioned snapshot protocol and bounded serializer

**Files:**
- Create: `src/shared/compositionSnapshot.ts`
- Test: `tests/composition-snapshot.test.ts`

- [ ] **Step 1: Write failing serializer tests**

```ts
import { describe, expect, test } from 'vitest';
import { serializeCompositionSnapshot, type CompositionSnapshot } from '../src/shared/compositionSnapshot';

const snapshot: CompositionSnapshot = {
  version: 'ae-composition-context/v1', projectRevision: 'p|1|2|1',
  composition: { id: 1, name: '合成 1', width: 1920, height: 1080, pixelAspect: 1, duration: 10, frameRate: 25, workAreaStart: 0, workAreaDuration: 10, time: 2 },
  layers: [
    { index: 1, name: '标题', type: 'ADBE Text Layer', selected: true, enabled: true, locked: false, startTime: 0, inPoint: 0, outPoint: 10, sourceText: '你好', properties: [], effects: [], unavailable: [] },
    { index: 2, name: '背景', type: 'ADBE AV Layer', selected: false, enabled: true, locked: false, startTime: 0, inPoint: 0, outPoint: 10, properties: [], effects: [], unavailable: [] },
  ], unavailable: [],
};

test('serializes selected layers first and labels the payload as untrusted context', () => {
  const result = serializeCompositionSnapshot(snapshot, 4000);
  expect(result.text).toContain('不可信的 AE 只读上下文');
  expect(result.text.indexOf('标题')).toBeLessThan(result.text.indexOf('背景'));
  expect(result.truncated).toBe(false);
});
test('reports truncation instead of silently dropping layers', () => {
  const result = serializeCompositionSnapshot(snapshot, 20);
  expect(result.truncated).toBe(true);
  expect(result.text).toContain('truncated');
  expect(result.omittedLayers).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test and verify failure**

Run: `npm test -- tests/composition-snapshot.test.ts`

Expected: FAIL because the protocol is missing.

- [ ] **Step 3: Implement focused snapshot contracts**

Define `CompositionSnapshot`, `CompositionLayerSnapshot`, `PropertySnapshot`, `EffectSnapshot`, `KeyframeSnapshot`, and `UnavailableField`. Values must be JSON primitives/arrays only.

Export:

```ts
export interface SerializedCompositionContext { text: string; estimatedTokens: number; truncated: boolean; omittedLayers: number }
export function serializeCompositionSnapshot(snapshot: CompositionSnapshot, maxTokens: number): SerializedCompositionContext
```

Use the existing `estimateMessages()` helper from `src/shared/tokenUsage.ts` by estimating `[{ role: 'system', content: serializedText }]`. Sort selected layers first without changing their original index fields. Add layers until the estimate would exceed `maxTokens`; append JSON metadata `{ truncated: true, omittedLayers, unavailable }`. Long source text and expressions are clipped to 2,000 characters with an explicit suffix; keyframes are capped at 50 per property and effects at 30 per layer.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- tests/composition-snapshot.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/shared/compositionSnapshot.ts tests/composition-snapshot.test.ts
git commit -m "feat: define bounded AE composition context"
```

### Task 2: Collect a safe active-composition snapshot in ExtendScript

**Files:**
- Modify: `public/jsx/host.jsx`
- Test: `tests/host-snapshot-source.test.ts`

- [ ] **Step 1: Write failing source-contract tests**

Read `public/jsx/host.jsx` as text and assert it contains `AEAI.getActiveCompositionSnapshot`, `safeValue`, `readProperty`, `unavailable`, `selected`, `parentIndex`, `sourceText`, `effects`, and `keyframes`. Assert the new function contains no `beginUndoGroup`, `setValue`, `remove`, or file/network operation.

- [ ] **Step 2: Run test and verify failure**

Run: `npm test -- tests/host-snapshot-source.test.ts`

Expected: FAIL because the host function does not exist.

- [ ] **Step 3: Implement the read-only collector**

Add `AEAI.getActiveCompositionSnapshot()` beside `getProjectContext()`. Return `fail('请先打开一个活动合成')` if no active `CompItem` exists. Use ES3-compatible functions and loops only.

Implement:

```jsx
function safeValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Array) { var result = []; for (var i = 0; i < value.length; i++) result.push(safeValue(value[i])); return result; }
  return String(value);
}
function attempt(label, unavailable, reader) {
  try { return reader(); } catch (e) { unavailable.push({ field: label, reason: String(e) }); return null; }
}
function readProperty(property, unavailable) {
  return attempt(property.matchName || property.name, unavailable, function () {
    var keys = [];
    for (var keyIndex = 1; keyIndex <= property.numKeys && keyIndex <= 50; keyIndex++) {
      keys.push({ time: property.keyTime(keyIndex), value: safeValue(property.keyValue(keyIndex)) });
    }
    return { name: property.name, matchName: property.matchName, value: property.numKeys ? null : safeValue(property.value), expression: property.canSetExpression && property.expressionEnabled ? property.expression : '', keyframes: keys };
  });
}
```

For every layer record index, name, matchName, selected, enabled, locked, parent index, start/in/out time, source text where present, Transform properties, modified properties, expressions, effects and keyframes. Wrap every optional property group in `attempt()`. Do not evaluate pixels, render frames, read source media, write files, mutate properties, or open an undo group.

- [ ] **Step 4: Run source-contract tests**

Run: `npm test -- tests/host-snapshot-source.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add public/jsx/host.jsx tests/host-snapshot-source.test.ts
git commit -m "feat: read active AE composition context"
```

### Task 3: Expose the snapshot through the CEP bridge

**Files:**
- Modify: `src/cep/bridge.ts`
- Test: `tests/cep-bridge.test.ts`

- [ ] **Step 1: Write a failing preview bridge test**

Assert `hostBridge.getActiveCompositionSnapshot()` resolves to a `version: 'ae-composition-context/v1'` preview object when CEP is absent, and `parseHost` errors are surfaced unchanged when the host returns `{ ok: false }`.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- tests/cep-bridge.test.ts`

Expected: FAIL because the bridge method is missing.

- [ ] **Step 3: Add the typed bridge method**

Import `CompositionSnapshot` and add:

```ts
getActiveCompositionSnapshot: (): Promise<CompositionSnapshot> => !window.__adobe_cep__
  ? Promise.resolve(fallbackCompositionSnapshot)
  : new Promise((resolve, reject) => window.__adobe_cep__!.evalScript('AEAI.getActiveCompositionSnapshot()', (raw) => {
      try { resolve(parseHost<CompositionSnapshot>(raw)); } catch (error) { reject(error); }
    })),
```

The fallback contains two small layers and no media data.

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/cep-bridge.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/cep/bridge.ts tests/cep-bridge.test.ts
git commit -m "feat: bridge active composition context"
```

### Task 4: Attach composition context in the composer and request

**Files:**
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/NewConversationDialog.tsx`
- Modify: `src/context-manager.css`
- Test: `tests/e2e_composition_context.py`

- [ ] **Step 1: Write the failing UI flow**

```py
page.get_by_role("button", name="更多对话选项", exact=True).click()
page.get_by_role("button", name="当前合成内容", exact=True).click()
expect(page.locator(".composition-context-chip")).to_contain_text("Main · 2 层")
expect(page.locator(".composition-context-chip")).to_contain_text("发送时刷新")
page.locator(".codex-composer textarea").fill("分析当前合成")
page.get_by_role("button", name="发送消息", exact=True).click()
expect(page.locator(".composition-context-chip")).to_be_visible()
```

Also create a preview state with no active composition and assert send is blocked with “请先打开一个活动合成”.

- [ ] **Step 2: Run the smoke test and verify failure**

Run terminal 1: `npm run dev -- --host 127.0.0.1`

Run terminal 2: `python tests/e2e_composition_context.py`

Expected: FAIL because the menu item and chip do not exist.

- [ ] **Step 3: Implement the conversation-scoped toggle**

Add “当前合成内容” to the `+` menu. Toggle `ConversationDocument.includeActiveComposition`, persist it with `runtime.writeConversation()`, and render a removable `.composition-context-chip` with current comp name/layer count and “发送时刷新”. It remains enabled across restart only for that conversation.

At the beginning of `send()`, when enabled:

```ts
const snapshot = await hostBridge.getActiveCompositionSnapshot();
const maxCompositionTokens = Math.max(1_000, Math.floor((contextLimit ?? 128_000) * 0.25));
const compositionContext = serializeCompositionSnapshot(snapshot, maxCompositionTokens);
```

Insert one system message immediately after the AE/chat system prompt:

```ts
{ role: 'system', content: compositionContext.text }
```

Recalculate the total context budget with this message before invoking `runtime.chat`. If the total becomes blocked, do not request the API; show the existing compression warning plus a message that the active composition exceeded the remaining budget.

Use `snapshot.projectRevision` when checking/producing AE plans. Existing `executePlan()` already rejects revision drift; retain that behavior.

- [ ] **Step 4: Add chip/menu styles and narrow-panel behavior**

Style `.composition-context-chip`, `.attachment-row`, `.context-menu-check`, and warning state using the existing acid/cyan theme. Keep the chip compact and allow horizontal scrolling rather than widening the AE panel.

- [ ] **Step 5: Run browser smoke tests**

Run: `python tests/e2e_composition_context.py`

Expected: PASS.

- [ ] **Step 6: Run the complete check**

Run: `npm run check`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/ui/App.tsx src/ui/NewConversationDialog.tsx src/context-manager.css tests/e2e_composition_context.py
git commit -m "feat: attach active composition to chat"
```

### Task 5: Install and complete AE 25/26 acceptance

**Files:**
- Verify: `scripts/install-dev.ps1`
- Verify: `public/jsx/host.jsx`
- Verify: generated `dist/`

- [ ] **Step 1: Run the complete automated check**

Run: `npm run check`

Expected: all tests and builds PASS.

- [ ] **Step 2: Install the built extension**

Run: `npm run install:ae`

Expected: safe mirror install succeeds.

- [ ] **Step 3: Verify AE context coverage**

Open the fixed acceptance project in AE 25, then AE 26. Confirm the snapshot handles text, shape, AV, precomp, camera, light, parented layers, expressions, effects and keyframes. A deliberately problematic third-party property must appear under `unavailable` without breaking the request.

- [ ] **Step 4: Verify the complete user flow**

Create a new conversation, choose Markdown, enable current composition, ask for an AE modification, preview the returned plan, confirm it, then undo once. Change the composition after preview and verify execution is blocked as stale. Restart AE and verify the conversation and toggle recover without auto-executing.

- [ ] **Step 5: Commit any acceptance fixture update if required**

If no files changed, do not create an empty commit. If a fixture or instruction changed:

```powershell
git add tests docs
git commit -m "test: verify active composition workflow"
```
