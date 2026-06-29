## Workspace task 2 fix3 report

Date: 2026-06-29

### Status

Completed.

### Root cause

`write()` serialized per-document writes through `serializeDocumentOperation(...)`, but `moveProject()` performed its reservation and rename sequence outside the same per-document queue. A writer could pass the source `.move-reservation` missing check, pause before writing, let a move complete, then resume and recreate the old source JSON.

### Changes

- Added a regression test for the pre-lock-window race where a source write has already passed the missing reservation check but has not yet opened its temporary file.
- Updated `moveProject()` to:
  - determine affected source and target document queue keys before moving;
  - acquire the same per-document queue used by `write()`;
  - re-read source documents after acquiring the queue so old snapshots are not moved over newer writes;
  - keep the existing reservation, recovery, conflict, rollback, cleanup, redirection, and sanitization paths intact by moving the original move body into `moveProjectDocuments(...)`.

### Verification

- RED observed: `npm test -- tests/conversation-store.test.ts` failed on the new race test before the implementation change because the move settled before the paused writer was released.
- GREEN: `npm test -- tests/conversation-store.test.ts` passed, 30 tests.
- Full tests: `npm test` passed, 24 files / 123 tests.
- Build: `npm run build` passed.

### Concerns

- `npm run build` still emits the existing Vite warning about chunks larger than 500 kB after minification; no new build failure.
- The move operation locks the documents discovered in its initial source scan, then re-reads those same ids under lock. A brand-new conversation id created after that scan is not included in that move batch, matching the deterministic-key requirement without introducing a project-wide queue.
