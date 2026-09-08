# Phase 2 implementation report

Completion update (2026-09-07): Phase 2 remains complete and its capture behavior passes the cumulative Phase 5 suite. Phase 3 completed its queue, Phase 4 added flat solution writes, and Phase 5 added the atomic managed README commit. Real LeetCode/browser verification remains open.

Status: Phase 2 is implemented and automated verification passes. GitHub pushing, commit creation, production retry queues and README generation were not implemented.

## What was implemented

- A WXT `MAIN`-world content script installed at `document_start` observes LeetCode `fetch` and `XMLHttpRequest` traffic.
- Submission POST requests are correlated with their returned numeric submission IDs. The observer keeps the exact submitted source string, language, internal question ID, slug and request timestamp in memory.
- Result-check responses emit candidates only for `Accepted`/`AC`. Pending, started and judging responses remain correlated; wrong answer, runtime error, compile error, time-limit exceeded and other terminal failures are discarded without capture.
- A separate isolated-world content script validates the page bridge, enriches candidates, normalizes records, suppresses duplicate/in-flight events and sends records through extension messaging.
- Problem metadata comes from LeetCode's authenticated GraphQL endpoint, with a narrower fallback query and centralized DOM selectors. Captures include problem number/title/slug/canonical URL, language, topics, available companies, submitted timestamp and captured timestamp.
- Missing topics or company tags become empty arrays and do not block capture.
- The submitted source is never trimmed, normalized or rewritten. Validation checks it for presence and a 1 MB upper bound while retaining the original string.
- The background validates the complete normalized record again, accepts capture messages only from the extension's content script on an exact `https://leetcode.com/problems/<slug>/` page, and atomically deduplicates by submission ID.
- Captures are stored newest-first in `chrome.storage.local`/`browser.storage.local` under `lgs-captures-v1`, capped at 50 records and approximately 4 MB.
- Client-side navigation is detected by `popstate` plus DOM mutation observation. Navigation clears metadata cache; network interception persists across LeetCode route changes.
- Error reporting from the content pipeline logs only a fixed message. Source code, tokens, cookies and response payloads are never logged by active Phase 2 code.

## Problems found

- The inactive TypeScript interceptor had a useful request-correlation idea, but it logged submission payloads, exposed a page debug emitter, used wildcard page messages, and invoked obsolete sync code immediately.
- It coupled extraction, metadata loading and GitHub writes, making accepted filtering and duplication behavior difficult to test separately.
- It depended on one REST URL shape and did not validate normalized records at the background boundary.
- During the new integration test, a first implementation treated any textual status including `Pending` as terminal. That removed the pending source before the later Accepted result. The final logic keeps pending/started/judging states and removes only terminal results.
- Phase 1's manifest check assumed one content script. It now validates both the page-world and isolated-world entries, their exact match scope, worlds and run times.

## Files changed

Created:

- `extension/entrypoints/leetcode-main.content.js`
- `extension/leetcode/network-observer.js`
- `extension/leetcode/protocol.js`
- `extension/leetcode/record.js`
- `extension/leetcode/metadata.js`
- `extension/leetcode/selectors.js`
- `extension/leetcode/pipeline.js`
- `extension/leetcode/navigation.js`
- `tests/phase2.test.js`
- `PHASE2_REPORT.md`

Changed:

- `extension/entrypoints/leetcode.content.js`: isolated capture pipeline and navigation handling.
- `extension/entrypoints/background.js`: sender-specific authorization for capture messages.
- `extension/lib/compat.js`: exact LeetCode content-script sender validation.
- `extension/lib/service.js`: normalized history persistence and duplicate handling.
- `extension/lib/storage.js`: capture-history storage key.
- `scripts/check-manifest.mjs`: two-script/world validation.
- `scripts/check-runtime.mjs`: production worker capture messaging, deduplication and sender rejection.
- `README.md`: Phase 2 behavior and storage documentation.

Pre-existing inactive TypeScript/CRXJS files and user changes remain untouched during Phase 2. GitHub authentication code, scopes, storage keys and UI flow were preserved.

## Detection and extraction approach

The page-world observer wraps both network APIs once and delegates parsing to pure helpers. For each `/problems/<slug>/submit/` request it records the raw `typed_code`/source field before the request and associates it with the numeric ID in the submit response. For each `/submissions/detail/<id>/check/` response it normalizes status and emits only after a matching accepted result. Repeated checks are suppressed by an emitted-ID set.

The observer posts the candidate to the isolated world using a fixed, versioned message shape and same-origin target. The isolated script checks `source`, event type, `event.source`, and origin. It loads trusted metadata separately, constructs the requested schema, and sends it through the WebExtension runtime. The background validates the sender URL and every record field before storage. Background history is authoritative for deduplication, so service-worker restart or duplicate content events cannot create a second record.

GraphQL is preferred because DOM labels and layout change more often. The first query requests company statistics; if that field is unavailable, a narrower problem/topic query is retried. DOM fallback selectors are all in `selectors.js` and can be revised independently. Missing company data is deliberately nonfatal.

`submittedAt` is the local ISO timestamp captured at the submission request because the existing check response does not reliably include a canonical submission timestamp. `capturedAt` is assigned when the isolated pipeline creates the validated record.

## Test and build results

Final verification commands:

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
- Tests: 24 passed, 0 failed (12 Phase 1 plus 12 Phase 2 tests).
- Phase 2 tests cover accepted filtering; pending and rejected statuses; exact source correlation; ID/slug/body extraction; normalized metadata; missing topics/companies; company-stat parsing; simultaneous duplicate events and repeated DOM updates; client navigation/cache invalidation; content-to-background storage; 50-record eviction; fixed sanitized logging.
- Chrome MV3 build: passed.
- Edge MV3 build: passed.
- Firefox MV3 build: passed.
- Manifest validation: passed for all three targets, including two LeetCode-only content entries and `MAIN`/isolated execution settings.
- Compiled background runtime checks: passed for Chrome, Edge and Firefox API doubles, including capture sender authorization, persistence and deduplication.
- Whitespace/error check: passed.

## Features requiring real-browser verification

- A real LeetCode submission through the current production editor and API response shape.
- `fetch` and XMLHttpRequest interception in current Chrome, Edge and Firefox, especially Firefox's MV3 `MAIN` execution world.
- Client-side navigation across several problem pages without a full reload.
- Metadata behavior for signed-out, standard, premium and contest problems.
- Availability and shape of company metadata for each account tier.
- Browser-local storage quota behavior with unusually large solutions.
- Exact source preservation for non-ASCII code and every supported editor/language.

This environment still does not expose an extension-capable Chrome/Edge/Firefox surface, so automated API doubles and generated manifests cannot establish those live outcomes.

## Known LeetCode selector and API risks

- LeetCode can rename `/submit/` or `/submissions/detail/<id>/check/`, change request field names, move judging to GraphQL/subscriptions, or change response status fields. Protocol helpers isolate these assumptions.
- `companyTagStats` is undocumented and may be absent, premium-gated, JSON-encoded or structurally different. Capture continues with an empty company array.
- DOM selector fallback may become stale or match unrelated tag links if LeetCode restructures the page. All selectors are centralized; network metadata remains preferred.
- Some nonstandard problem IDs (for example interview/LCR labels) are not numeric. The normalized schema requires a positive integer, so the internal numeric question ID is used when the frontend ID is nonnumeric; live verification is required for these pages.
- A hostile page can synthesize same-origin bridge messages. Strict record validation, GraphQL enrichment, exact sender checks, background deduplication and local-only Phase 2 storage limit impact, but page-world data cannot be treated as cryptographically trusted.
- The in-memory correlation map is lost on a full page reload between submission and verdict. Normal LeetCode judging occurs within the same page lifecycle; recovery from a mid-judge reload needs a separately designed mechanism if live testing shows it is common.

## Proposed Phase 3 scope

Phase 3 should implement the durable local synchronization queue without GitHub file writes: create and persist one queue job from each newly captured submission, define `queued`, `syncing`, `retrying`, `synced` and `failed` state transitions, classify retryable versus terminal errors, implement bounded exponential backoff with jitter and alarms, recover after worker/browser restart, serialize jobs by configured repository, expose queue status and manual retry in the popup/settings, and test duplicate capture-to-job behavior.

GitHub file creation/replacement, commits, conflicts and managed README generation should remain the next phase after the durable queue is verified.
