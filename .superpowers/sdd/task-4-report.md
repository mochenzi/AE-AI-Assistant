# Task 4 Report: Conversation drawer and new-conversation dialog

Status: DONE

Implemented:
- Added `ConversationDrawer` for project-grouped conversation list, search, select, rename, collapse/expand, and active item display.
- Added `NewConversationDialog` for creating a new external conversation with optional one-time Markdown snapshots.
- Integrated external `ConversationDocument` loading, listing, writing, title updates, model/chat-mode/context/token fields, and project move handling in `App.tsx`.
- Added UI for selecting and displaying the external conversation data directory.
- Added responsive drawer styling and Markdown chips in `src/context-manager.css`.
- Added Playwright smoke coverage in `tests/e2e_conversations.py` for drawer open/collapse, new conversation, Markdown selection, message-title update, search, switching, renaming, and per-conversation Markdown chips.

Validation:
- `npm test` → PASS, 25 files / 128 tests.
- `npm run build` → PASS.
- `python -m py_compile tests/e2e_conversations.py` → PASS.
- Manual local dev smoke:
  - Started `npm run dev -- --host 127.0.0.1`.
  - `python tests/e2e_conversations.py` → PASS.

Notes / concerns:
- The UI task was large and touched `App.tsx` significantly. A follow-up review should specifically check that legacy `AppState.conversations` remains migration-only and that active document writes do not regress normal chat sending.
- The requested “MD 脚本启动菜单” is intentionally not implemented in this task; the new Markdown picker/new conversation flow leaves a clean integration point for it.
