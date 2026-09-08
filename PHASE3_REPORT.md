# Phase 3 implementation report

Completion update (2026-09-07): Phase 3 remains complete. Phase 4 supplied the production GitHub executor and Phase 5 replaced its single-file write with the atomic solution-plus-README flow. Queue durability, retries and commit-result persistence remain active.

Status: durable local queue infrastructure is implemented and verified with injected executors. Production GitHub file writes remain deliberately disconnected, so real captured jobs stay queued.

## Implemented

- Every newly persisted capture atomically creates one durable queue job keyed by LeetCode submission ID.
- Queue jobs use the required `queued`, `syncing`, `retrying`, `synced`, and `failed` states with attempts, timestamps, next-attempt time, sanitized last error, target repository key, and the validated capture record.
- Duplicate captures never create duplicate jobs.
- Jobs created before repository setup stay queued without an alarm. Saving a valid configuration binds those unassigned jobs and schedules processing.
- Jobs left in `syncing` after worker/browser interruption recover to `queued` at startup.
- Processing persists `syncing` before invoking an executor and handles one job at a time. This is globally sequential and therefore also sequential per repository.
- Recoverable network, HTTP 5xx, explicit rate-limit, and conflict errors enter `retrying`. Authentication, authorization, missing repository/branch, and invalid-data errors enter `failed`.
- Retry delay uses bounded exponential backoff with ±20% jitter: 30 seconds initially and at most one hour. Explicit rate-limit reset time takes precedence. Automatic attempts stop after six.
- Retry alarms persist the next due time. The background handles queue alarms and resumes/recoveries on startup/install.
- Manual retry resets a failed job to `queued`, clears its error/attempt count, and schedules it.
- Popup/options now show the active queue count, latest sanitized failure with manual retry, and last successfully processed problem. Queue summaries never expose source code.
- Queue capacity is 200. When full, a terminal job may be evicted for a new capture; active jobs are never evicted. If all 200 are active, the new capture fails cleanly instead of silently losing prior work.

## Files created or changed

Created:

- `extension/sync/queue.js`
- `tests/phase3.test.js`
- `PHASE3_REPORT.md`

Changed:

- `extension/lib/storage.js`: queue key and atomic multi-key writes.
- `extension/lib/service.js`: capture-to-job transaction, queue processor, startup recovery, configuration binding, status summaries, manual retry.
- `extension/entrypoints/background.js`: queue-alarm dispatch.
- `extension/ui/App.jsx`: queue status and retry controls.
- `scripts/check-runtime.mjs`: fixed the VM's missing URL global and retained compiled-worker capture checks.
- `README.md`: Phase 3 runtime and storage behavior.
- `tests/foundation.test.js`: storage-failure check covers the new atomic write path.

Phase 2 was also finalized in this turn: its three browser builds and manifest validation passed; the initial compiled-worker failure was traced to a missing `URL` global in the test VM. The browser runtime supplies `URL`, and the corrected harness validates the actual bundles.

## Verification

Commands:

```sh
npm run lint
npm test
npm run build
npm run build:edge
npm run build:firefox
npm run check:manifest
npm run check:runtime
git diff --check
```

- Lint: passed.
- Tests: 33 passed, 0 failed (12 Phase 1, 12 Phase 2, 9 Phase 3).
- Phase 3 coverage includes atomic capture-to-job deduplication, unconfigured job binding, capacity behavior, restart recovery, sequential execution, persisted syncing state, jittered/capped retry, the six-attempt limit, rate-limit reset, retryable conflicts, sanitized terminal errors, queue summaries, and manual retry.
- Chrome MV3 build: passed.
- Edge MV3 build: passed.
- Firefox MV3 build: passed.
- Manifest validation: passed for all targets.
- Compiled worker checks: passed for Chrome, Edge and Firefox API doubles.
- Diff whitespace check: passed.

## Production behavior and remaining verification

There is intentionally no production queue executor. An accepted submission is captured and queued durably, but no GitHub request, commit or README change occurs. Unit tests inject deterministic executors to verify all transitions without creating external state.

Real-browser verification still needs an extension-capable Chrome, Edge and Firefox session: submit an accepted solution, inspect the local capture/job, restart during a simulated processing state, observe queue UI updates, and verify manual retry. The current environment does not expose those browser surfaces.

Queue storage includes submitted source code because future synchronization must survive browser restart. Browser-local storage quota is therefore a practical limit. Typical LeetCode solutions are small, but unusually large solutions or 200 active jobs may reach quota before the job-count cap. Storage write failures are surfaced as sanitized capture failures; no queued job is silently discarded.

## Proposed Phase 4 scope

Implement GitHub solution-file synchronization only:

- Add deterministic language-to-extension mapping and safe `<number>-<slug>.<ext>` paths directly under the configured solutions directory.
- Implement direct GitHub API reads/writes using the preserved token in the background.
- Create new solution files, replace the same problem/language file, and preserve different-language files.
- Connect the queue executor and map GitHub responses to Phase 3 error classifications.
- Read current file SHA before updates; handle branch/repository/auth errors and conflicts without force-push or unrelated changes.
- Store commit identity before marking a job `synced` and verify restart/idempotency behavior.
- Add unit/integration tests with API doubles and real-browser/test-repository verification instructions.

README generation and managed markers should remain Phase 5 so solution-file writes and conflict behavior can be verified independently first.
