# Model Picker and 1M Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CEP-incompatible model datalists with reliable selects plus manual entry, and persist a per-chat-model 1M context declaration.

**Architecture:** Put model metadata operations in shared pure functions, and place the reusable select/manual-input behavior in a focused React component. `App.tsx` composes those units for chat, image, video, and API profile editing without changing the API request protocol.

**Tech Stack:** React 18, TypeScript, CEP Chromium, Vitest, Playwright.

---

### Task 1: Per-model context declarations

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/modelSelection.ts`
- Modify: `src/shared/profileDraft.ts`
- Test: `tests/model-selection.test.ts`
- Test: `tests/profile-draft.test.ts`

- [ ] **Step 1: Write failing tests for declaration and synchronization**

Add tests asserting that `setDeclaredContextWindow(profile, 'model-a', true)` stores `1_000_000`, disabling it removes only the declaration, `effectiveContextWindow()` prefers the declaration, and `cacheProfileModels()` preserves declarations for matching model IDs.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/model-selection.test.ts tests/profile-draft.test.ts`

Expected: FAIL because declaration helpers and metadata do not exist.

- [ ] **Step 3: Implement minimal shared metadata behavior**

Extend `CachedModel` with:

```ts
declaredContextWindow?: number;
```

Add pure helpers:

```ts
export const ONE_MILLION_TOKENS = 1_000_000;
export function effectiveContextWindow(model?: CachedModel): number | undefined;
export function setDeclaredContextWindow(profile: ApiProfile, modelId: string, enabled: boolean): ApiProfile;
```

Update `cacheProfileModels()` to merge `declaredContextWindow` from the existing cached model with the same ID.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- tests/model-selection.test.ts tests/profile-draft.test.ts`

Expected: PASS.

### Task 2: Reliable model picker component

**Files:**
- Create: `src/ui/ModelPicker.tsx`
- Create: `tests/model-picker.test.tsx`
- Modify: `src/context-manager.css`

- [ ] **Step 1: Write failing component tests**

Cover these behaviors with jsdom and React DOM:

```tsx
<ModelPicker models={[{ id: 'm1' }, { id: 'm2' }]} value="m1" onChange={change} ariaLabel="模型" />
```

Assert the component renders a real `<select>`, selecting `m2` calls `onChange('m2')`, selecting the manual option exposes a text input, and an unlisted current value starts in manual mode.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/model-picker.test.tsx`

Expected: FAIL because `ModelPicker` does not exist.

- [ ] **Step 3: Implement the component**

Use a native select for cached choices and a sentinel option `__manual_model__`. In manual mode render a controlled text input and a “返回模型列表” button. If no models are cached, render the text input directly. Do not use `datalist`.

- [ ] **Step 4: Add compact styling**

Match the existing industrial dark interface, reuse current input/select colors, and keep controls usable at the narrow AE panel width. Add no new animation beyond existing button feedback.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npm test -- tests/model-picker.test.tsx`

Expected: PASS.

### Task 3: Integrate all model selectors and 1M declaration

**Files:**
- Modify: `src/ui/App.tsx`
- Modify: `src/context-manager.css`
- Test: `tests/e2e_redesign.py`

- [ ] **Step 1: Extend the browser regression test**

Assert that the API page contains no `datalist`, synced model controls are native selects, selecting a model changes the displayed value, manual mode accepts an arbitrary model ID, and checking “声明支持 1M” persists after saving and reopening the profile.

- [ ] **Step 2: Run the browser test and verify RED**

Run the existing Vite + Playwright command for `tests/e2e_redesign.py`.

Expected: FAIL because the page still renders datalists and has no declaration checkbox.

- [ ] **Step 3: Replace all datalists**

Use `ModelPicker` inside `CapabilityModelSwitcher` and the API capability model fields. Remove the old datalist elements and IDs. Keep provider switching and active selection updates unchanged.

- [ ] **Step 4: Add the chat-only declaration checkbox**

Beside the API chat model picker, render a checkbox checked when the selected cached model has `declaredContextWindow === 1_000_000`. Disable it when no chat model is selected. On change, call `setDeclaredContextWindow()` and update the draft.

- [ ] **Step 5: Use the effective context length in chat**

Replace direct reads of `selectedModelMeta.contextWindow` with `effectiveContextWindow(selectedModelMeta)` so the Token meter and blocking thresholds honor the declaration.

- [ ] **Step 6: Run browser test and verify GREEN**

Expected: PASS.

### Task 4: Verify, install, and publish

**Files:**
- Verify all changed files

- [ ] **Step 1: Run full validation**

Run: `npm run check`

Expected: all Vitest suites and both Vite builds pass.

- [ ] **Step 2: Run both Playwright checks**

Run `tests/e2e_redesign.py` and `tests/e2e_preview.py` through the local Vite server helper.

Expected: both exit 0.

- [ ] **Step 3: Install into AE**

Run: `npm run install:ae`

Expected: build succeeds and the CEP extension directory is updated.

- [ ] **Step 4: Commit and push**

```powershell
git add src tests docs
git commit -m "fix: replace CEP model datalists"
git push origin master
```

Expected: local `master` matches `origin/master`.
