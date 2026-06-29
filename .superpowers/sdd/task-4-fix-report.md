# Task 4 Fix Report

Status: DONE

Fixed:
- Critical: Added previous `ProjectIdentity` tracking in `ChatPage`; when an `unsaved` project becomes saved, the UI calls `runtime.moveConversationProject(directory, previous.key, savedIdentity)`, reloads summaries for the saved project, and preserves the active conversation id/document when present.
- Important: Markdown picker cancel no longer creates `preview.md` in CEP. The `preview.md` fallback is now limited to non-CEP dev preview mode.
- Important: `tests/e2e_conversations.py` no longer removes the send button `disabled` attribute. Dev preview can now send through the real button path without a configured chat model; CEP still requires a configured model.
- Important: `ConversationDrawer` no longer nests a role/button rename control inside a button. Each conversation row now has a row container, a separate selection button, and a separate rename button.
- Minor: Markdown snapshot system messages now interpolate the real snapshot name instead of sending literal `{name}`. The related context-profile message interpolation was corrected as well.

Tests added/updated:
- Added `tests/conversation-drawer.test.tsx` to lock valid drawer/rename markup.
- Added `buildMarkdownSnapshotMessages()` coverage in `tests/conversation-workspace.test.ts`.
- Updated `tests/e2e_conversations.py` to assert the send button is enabled and to use the real click path.

Validation:
- `npm test` -> PASS, 26 files / 130 tests.
- `npm run build` -> PASS.
- `python -m py_compile tests/e2e_conversations.py` -> PASS.
- `python tests/e2e_conversations.py` with `npm run dev -- --host 127.0.0.1` -> PASS.

Concerns:
- `npm test` emits the existing React `act(...)` environment warning in the new drawer test, but the test suite passes.
- `npm run build` continues to emit the existing Vite chunk-size warning.
