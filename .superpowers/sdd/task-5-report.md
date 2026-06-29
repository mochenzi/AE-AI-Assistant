# Task 5 Report: Migrate legacy live conversations and verify installation

## Status

Implemented and committed.

## Changes

- Added `src/shared/conversationMigration.ts`.
  - `convertLegacyConversations()` converts legacy `AppState.conversations` into external `ConversationDocument` values using stable legacy IDs.
  - It copies messages, selected context snapshots, context ids, title, archived status, handoff summary, created timestamp, and migration updated timestamp.
  - `persistLegacyConversations()` writes every external document before invoking legacy-state clearing.
- Updated `src/ui/App.tsx`.
  - Legacy conversations are retained while no conversation data directory is selected.
  - Chat auto-directory selection and History directory selection now defer migration until after a directory is selected and verified.
  - External writes complete before `saveState()` clears `conversations` and sets `activeConversationId`.
  - Write failures leave the original legacy state untouched and surface the error notice.
- Added tests in `tests/state-migration.test.ts`.
  - Verified deferred retention before directory selection.
  - Verified write-before-clear ordering.
  - Verified `clear` is not called when an external write fails.

## Verification

- RED check:
  - `npm test -- tests/state-migration.test.ts`
  - Failed initially because `src/shared/conversationMigration.ts` did not exist.
- Focused tests:
  - `npm test -- tests/state-migration.test.ts`
  - PASS: 9 tests.
- Complete checks:
  - `npm run check`
  - PASS: 26 files, 132 tests, app build, node build.
- AE installation:
  - `npm run install:ae`
  - PASS: build completed and extension installed; installer requested AE restart and opening `Window > Extensions > AE AI Assistant`.

## Manual AE verification

Not performed inside this agent session because it requires interactive AE 25/26 operation. The installed build is ready for the requested manual checklist:

1. Restart AE 25 and AE 26.
2. Open `Window > Extensions > AE AI Assistant`.
3. Choose a non-C data directory.
4. Create two conversations with different Markdown files.
5. Send messages, switch conversations, and search.
6. Restart AE and confirm the active conversation and list recover without executing an action.

## Concerns

- Existing test/build warnings remain:
  - React test environment `act(...)` warnings in `tests/conversation-drawer.test.tsx`.
  - Vite large chunk warning for the app bundle.
- Legacy selected context snapshots are stored as `markdownSnapshots` with `sourcePath: context:<id>` because `ConversationDocument` has no separate context snapshot field.
