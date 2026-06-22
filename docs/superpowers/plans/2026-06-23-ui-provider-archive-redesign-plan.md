# UI, Provider, and Archive Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve AE panel feedback and layout, make API profiles reliably editable, add provider presets and per-page model switching, and archive complete conversations to a user-selected non-system directory.

**Architecture:** Add pure shared modules for provider presets, state migration, profile drafts, active model selection, and Markdown archive serialization. Keep filesystem writes in the CEP Node runtime and folder selection in the CEP bridge; UI pages consume these interfaces without direct Node access.

**Tech Stack:** React 18, TypeScript, Vite, CEP Node, ExtendScript, Vitest, Python Playwright.

---

### Task 1: State migration and provider presets

**Files:**
- Create: `src/shared/providers.ts`
- Create: `src/shared/stateMigration.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/shared/appState.ts`
- Test: `tests/providers.test.ts`
- Test: `tests/state-migration.test.ts`

- [ ] **Step 1: Write failing provider and migration tests**

```ts
expect(getProviderPreset('deepseek').baseUrl).toBe('https://api.deepseek.com/v1');
expect(getProviderPreset('volcengine').models?.endpoint).toBeTruthy();
expect(migrateState({ profiles: [] }).activeSelections).toEqual({});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/providers.test.ts tests/state-migration.test.ts`
Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement types, presets, and backward-compatible migration**

Add `providerId`, `cachedModels`, and `modelsUpdatedAt` to `ApiProfile`; add `activeSelections` and `archiveDirectory` to `AppState`; add `archivePath` and `handoffSummary` to `Conversation`. Implement immutable default merging that preserves old profiles, conversations, tasks, templates, and token totals.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm test -- tests/providers.test.ts tests/state-migration.test.ts`
Expected: PASS.

Commit: `feat: add provider presets and state migration`

### Task 2: Editable API profile drafts and model caching

**Files:**
- Create: `src/shared/profileDraft.ts`
- Modify: `src/ui/App.tsx`
- Modify: `src/node/cepRuntime.ts`
- Test: `tests/profile-draft.test.ts`
- Test: `tests/e2e_preview.py`

- [ ] **Step 1: Write the failing stable-ID regression test**

```ts
const draft = beginProfileEdit(saved);
expect(saveProfileDraft([saved], { ...draft, name: '修改后' })).toEqual([{ ...saved, name: '修改后' }]);
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/profile-draft.test.ts`
Expected: FAIL because draft helpers do not exist.

- [ ] **Step 3: Implement explicit draft editing**

Provider selection creates a draft from a preset. Saved profiles reopen as editable drafts, retain IDs, support discard, and treat blank API keys as unchanged. Model sync stores normalized `{ id, contextWindow? }` values plus an ISO timestamp on the profile. Show an inline save/error indicator next to form actions.

- [ ] **Step 4: Extend preview regression coverage**

Playwright flow: create profile, save, leave API page, return, rename profile, save again, and assert only one profile card exists with the updated name.

- [ ] **Step 5: Verify and commit**

Run: `npm test`, then `python C:\Users\19474\.codex\skills\webapp-testing\scripts\with_server.py --server "npm run dev -- --host 127.0.0.1" --port 5173 -- python tests\e2e_preview.py`
Expected: unit tests pass; preview flow shows the edited profile exactly once.

Commit: `fix: keep API profiles editable after save`

### Task 3: Per-capability provider and model selection

**Files:**
- Create: `src/shared/modelSelection.ts`
- Modify: `src/ui/App.tsx`
- Modify: `src/node/apiClient.ts`
- Test: `tests/model-selection.test.ts`

- [ ] **Step 1: Write failing selection tests**

```ts
expect(resolveSelection(state, 'chat').model).toBe('chat-model');
expect(withSelectedModel(profile, 'image', 'image-v2').image?.model).toBe('image-v2');
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/model-selection.test.ts`
Expected: FAIL because selection helpers do not exist.

- [ ] **Step 3: Implement selectors and request overrides**

Store `{ profileId, model }` separately for chat, image, and video. Chat and media requests clone the selected profile and override only the requested capability model. Filter provider controls by capability; use cached models when available and a manual model input otherwise.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- tests/model-selection.test.ts tests/api-client.test.ts`
Expected: PASS with no regression in API payloads.

Commit: `feat: switch providers and models per capability`

### Task 4: External Markdown conversation archives

**Files:**
- Create: `src/shared/conversationArchive.ts`
- Modify: `src/node/cepRuntime.ts`
- Modify: `src/cep/bridge.ts`
- Modify: `src/ui/App.tsx`
- Test: `tests/conversation-archive.test.ts`

- [ ] **Step 1: Write failing archive tests**

```ts
const markdown = serializeConversation(conversation, contexts);
expect(markdown).toContain('# 项目片头');
expect(markdown).toContain('## 对话记录');
expect(compactArchivedConversation(conversation, 'D:/AI/archive.md').messages).toEqual([]);
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/conversation-archive.test.ts`
Expected: FAIL because archive helpers do not exist.

- [ ] **Step 3: Implement atomic external archive writes**

Add CEP folder selection, `archiveConversation(directory, conversation, contexts)`, filename sanitization, UTF-8 Markdown serialization, temporary-file rename, and writability errors. Only after a successful write should the UI clear full messages from the system-drive state and store `archivePath` plus `handoffSummary`.

- [ ] **Step 4: Add history directory controls**

Show the selected directory, a choose-directory button, the archive file link, and a clear explanation that API secrets remain DPAPI-protected in the system profile.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- tests/conversation-archive.test.ts tests/storage.test.ts`
Expected: PASS, including invalid-directory failure without conversation compaction.

Commit: `feat: archive conversations outside system drive`

### Task 5: Chat layout and button feedback

**Files:**
- Modify: `src/ui/App.tsx`
- Modify: `src/styles.css`
- Modify: `src/context-manager.css`
- Modify: `tests/e2e_preview.py`

- [ ] **Step 1: Add failing DOM and style assertions**

Assert `.conversation-frame`, `.model-switcher`, and `.context-compact` exist; assert primary buttons have a non-default active transform.

- [ ] **Step 2: Verify RED**

Run the preview test through `with_server.py`.
Expected: FAIL because the new containers and styles do not exist.

- [ ] **Step 3: Implement the revised layout and feedback**

Wrap chat history, action plan, and composer in a bordered conversation frame with a model toolbar. Replace the large context block with a compact single-line meter. Apply `transition`, `transform: scale(.96)`, color changes, focus-visible outlines, loading state, and disabled state consistently to clickable controls.

- [ ] **Step 4: Visual QA and commit**

Run Playwright at 430×820 and 900×800, capture screenshots, click every primary tab and profile/model selector, and assert no console errors.

Commit: `feat: refine chat layout and interaction feedback`

### Task 6: Documentation, installation, and release verification

**Files:**
- Modify: `README.md`
- Modify: `INSTALL.md`
- Modify: `使用说明.txt`

- [ ] **Step 1: Document external archives and model switching**

Explain how to choose an archive directory, the Markdown filename format, what remains on the system drive, provider presets, model sync, and per-page model switching.

- [ ] **Step 2: Run full validation**

Run: `npm run check`
Expected: all Vitest suites pass and both UI and Node bundles build.

- [ ] **Step 3: Reinstall the CEP extension**

Run: `npm run install:ae`
Expected: the current build is copied to `%APPDATA%\Adobe\CEP\extensions\com.chenyu.aeaiassistant`.

- [ ] **Step 4: Review, commit, and push**

Check for hard-coded secrets, arbitrary script execution, archive data left in system state, and generated build artifacts. Commit as `docs: update provider and archive usage`, then push `master` to `origin` after all checks pass.
