# Phase 5 implementation report

Status: Phase 5 is implemented and automated verification passes. Normal synchronization now creates one atomic Git commit containing the accepted solution and the regenerated managed root README, then advances the configured branch without force.

## README-generation design

- `extension/sync/readme.js` owns marker validation, repository-index parsing, record merging, Markdown escaping, GitHub file URLs, sorting and rendering independently of React and network code.
- The only managed region is bounded by `<!-- LEETGITSYNC:START -->` and `<!-- LEETGITSYNC:END -->`. With one valid pair, only the bytes between the markers change. Without markers, one block is appended while the original README remains an exact prefix.
- A missing, duplicated or reversed marker, or managed content that does not match the generated topic/table format, raises a terminal sanitized error before any new Git object is created.
- Each topic uses exactly `#`, `Problem` and `File` columns. Topics sort alphabetically; rows sort by numeric problem number, then stable textual fields.
- Each current submission appears under every supplied topic or `Uncategorized`. Companies are alphabetized and omitted when unavailable. Same-problem/same-language rows are replaced across old topics; different languages remain separate.
- Labels are NFKC-normalized, stripped of controls, whitespace-normalized and encoded for Markdown-sensitive characters using numeric entities. File URLs encode repository, branch and path components and always point to the configured GitHub code file.
- Rendering is deterministic. Equal README bytes and submission data produce equal managed Markdown bytes.

## Source of index truth and recovery behavior

The managed block in the repository's current root `README.md` is the durable index source. Every job reads and parses that block from the latest target branch, merges the current accepted record and regenerates the full block. Browser capture history and queue records deliver pending submissions, but neither is the sole source of existing index state.

This design recovers correctly after extension storage is cleared: the next accepted submission rebuilds from the repository README and retains prior rows. It adds no metadata JSON or other repository files. The visible generated rows contain the topic, problem number/title, company labels, language and code URL needed to reconstruct the index.

Malformed user edits inside the managed block fail safely rather than discarding entries. Handwritten content outside the markers remains byte-identical. If a user deletes both markers, the prior block cannot be distinguished from ordinary text; the extension follows the specification and appends one new managed block without deleting any existing content.

## Atomic GitHub commit design

The production executor uses GitHub Git-data REST endpoints in this order:

1. Read `git/ref/heads/<branch>` and retain its commit SHA as the expected parent.
2. Read that commit and its root tree.
3. Traverse tree objects to find the root README and deterministic solution path, then read existing blobs when present.
4. Parse the current README and generate the next solution and README contents.
5. Create UTF-8 blobs for both files.
6. Create one tree with `base_tree` set to the latest root tree and entries only for the solution path and `README.md`. All unrelated tree entries therefore remain inherited.
7. Create one commit whose sole parent is the initially read branch head.
8. Patch `git/refs/heads/<branch>` with the new commit SHA and `force: false`.
9. Return the commit identity to the Phase 3 queue only after GitHub confirms that the branch reference points to that SHA.

The Phase 4 Contents API remains used for read-only repository/branch validation in `extension/lib/github.js`. There is one production synchronization path: the atomic Git-data executor in `extension/sync/github-writer.js`.

The implementation follows GitHub's documented raw [Git database APIs](https://docs.github.com/en/rest/git), including [tree creation with `base_tree`](https://docs.github.com/en/rest/git/trees) and [non-force reference updates](https://docs.github.com/en/rest/git/refs).

## Conflict and idempotency behavior

- A `409` or `422` during the non-force reference update is treated as a possible branch-head conflict.
- The executor discards that attempt as unsuccessful, refetches the head/commit/tree/blobs, reparses the newest README and regenerates both changes. It performs at most three complete in-executor rebuild attempts before returning a retryable conflict to the durable queue.
- Failed attempts can leave unreachable blobs, trees or commits in GitHub's object database. They are never stored as successful results and never referenced by the target branch.
- If a worker is interrupted after the branch update but before local queue persistence, the next run sees byte-identical solution and README state, creates no Git objects, and stores the current head commit. This prevents duplicate commits and rows.
- Queue state changes to `synced` only when the result contains the SHA and URL of the commit confirmed at the branch ref. Failures contain no commit result and retain existing bounded retry behavior.

## Files changed

Created:

- `extension/sync/readme.js`
- `tests/phase5.test.js`
- `PHASE5_REPORT.md`

Changed:

- `extension/sync/github-writer.js`: replaced the normal Contents API file write with the atomic Git-data flow and bounded full regeneration.
- `extension/sync/queue.js`: terminal safe handling for malformed managed README state.
- `extension/ui/App.jsx`: accurate atomic solution/index synchronization status.
- `tests/phase4.test.js`: retained Phase 4 path, encoding, error, authentication and queue regressions while moving production write assertions to Phase 5 atomic tests.
- `README.md`: Phase 5 behavior and source map.
- `PHASE1_REPORT.md` through `PHASE4_REPORT.md`: cumulative completion notes.

Inactive TypeScript/CRXJS files and pre-existing user edits remain intact. No backend, database, analytics, ad, premium feature, metadata file, extra folder or hardcoded credential/repository target was introduced.

## Commands executed and results

Inspection used `rg`, `Get-Content`, `git branch --show-current`, `git status --short` and focused diffs. Implementation verification used:

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

- Lint: passed after replacing two sanitizer expressions flagged by ESLint.
- Tests: 54 passed, 0 failed. Phase 5 covers empty README creation; marker append/update/preservation; malformed, duplicate and reversed markers; grouping/sorting; multi-topic/company records; missing metadata; same/different-language merging; duplicate prevention; escaping; UTF-8; URLs; deterministic output; one atomic tree; commit parent and message; non-force ref success; idempotent no-op; full conflict regeneration; three-attempt conflict bound; pre-ref failure; terminal README failure; and queue commit identity.
- Chrome MV3 build: passed.
- Edge MV3 build: passed.
- Firefox MV3 build: passed.
- Manifest validation: passed for Chrome, Edge and Firefox.
- Compiled background-worker checks: passed for Chrome, Edge and Firefox with API doubles.
- `git diff --check`: passed; Git emitted only working-copy line-ending notices for pre-existing tracked files.

## Live behaviors still unverified

- Completed Device Flow authentication and organization/repository authorization in an installed extension.
- Current LeetCode accepted-submission interception and metadata behavior in Chrome, Edge and Firefox.
- A real atomic solution-plus-README commit against the configured test repository, including protected-branch behavior.
- A real concurrent branch update between commit creation and ref update.
- Browser shutdown or MV3 worker suspension at each Git-object/ref boundary.

No live repository write was made during automated testing. API doubles validate request order, payloads and state transitions without creating external repository content.

## Remaining security or data-loss risks

- Repository rules, protected branches, required signed commits, organization OAuth restrictions or workflow-file policies may reject Git-data writes after validation.
- GitHub returns `422` both for some non-fast-forward updates and other validation failures. The executor retries it within the strict conflict bound, then leaves it to the queue's bounded conflict policy; it never force-updates.
- Users can edit the managed block into an unparseable form. The extension then stops safely and requires the markers/block to be repaired; it does not guess and overwrite index data.
- Deleting both markers makes the previous generated text indistinguishable from user content, so one new managed block is appended as required and the old visible tables remain untouched.
- Existing malicious Markdown outside the markers is preserved exactly. Managed labels and URLs are normalized and escaped, but the extension does not sanitize user-owned README content.
- GitHub API size and rate limits still apply. Source capture is capped at 1 MB, while unusually large existing README files may fail API processing.
- End-to-end cross-browser behavior remains unverified on this host.

## Exact proposed Phase 6 scope

Phase 6 should be release and live-integration hardening, without adding product categories:

- Run the full accepted-LeetCode-submission-to-atomic-GitHub-commit flow in installed Chrome, Edge and Firefox builds against an explicitly configured test repository.
- Verify create, same-language update, different-language preservation, identical retry, browser restart, offline recovery, rate limits, protected branches and a real concurrent branch-head conflict.
- Add only fixes demonstrated by those live tests, including current LeetCode API/selector adjustments and GitHub repository-rule error mapping.
- Exercise storage migration from Phase 3/4 jobs and cleared-storage README recovery in browsers.
- Validate extension identity, OAuth application/store configuration, least permissions, Firefox data-consent metadata, CSP, package audit and distributable archives.
- Add a user-facing recovery path only if live testing proves malformed marker repair or failed-job selection needs more UI support.
- Produce a release-readiness report with exact browser versions, repository commits, remaining blockers and reproducible verification steps.

Phase 6 should not add a backend, database, ads, premium features, analytics, metadata files or unrelated dashboard work.
