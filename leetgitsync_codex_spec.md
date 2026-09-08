# LeetGitSync — Codex Implementation Specification

## Instructions for Codex

Work on the LeetGitSync project provided with this file. Treat this document as the source of truth for product behavior.

Before changing code:

1. Inspect the complete repository, including the extension manifest, source files, build configuration, authentication flow, storage logic, and existing GitHub integration.
2. Run the existing installation, build, lint, and test commands where available.
3. Identify which parts currently work and which parts are broken.
4. Preserve the working GitHub authentication implementation unless inspection proves that it is insecure or incompatible with the required browser stores.
5. Decide whether to repair or restructure each broken part only after inspecting it. Do not restart the project merely for convenience.
6. Do not introduce features outside this specification.
7. Do not assume missing product requirements. Record any blocking ambiguity before implementation.

## 1. Product Goal

Build LeetGitSync as a production-ready public browser extension that automatically synchronizes accepted LeetCode solutions to a user-selected GitHub repository.

The extension must eventually be publishable on all major browser-extension stores. The first version must focus only on reliable synchronization and a high-quality user experience.

Advertising, subscriptions, paid plans, and premium features are not part of the first version. The architecture should not prevent their later addition, but no monetization code should be implemented now.

## 2. Required User Flow

1. The user installs LeetGitSync.
2. The user authenticates with GitHub.
3. The user selects or configures a GitHub repository and target branch.
4. The user submits a solution on LeetCode.
5. When LeetCode marks the submission as `Accepted`, the extension captures the submitted code and required problem metadata.
6. The extension immediately queues and synchronizes the solution to GitHub.
7. The extension updates the repository's root `README.md`.
8. The extension displays a clear success, pending, retrying, or failed state.

No manual copying of code should be required after setup.

## 3. Browser Support

The implementation must be structured for publishing in all major browser-extension stores.

- Use WXT with the WebExtensions model and Manifest V3 where supported.
- Keep browser-specific APIs behind a small compatibility layer.
- Avoid browser-specific logic in the core synchronization code.
- Maintain separate manifest overrides only when a browser store requires them.
- Do not request permissions that are unrelated to LeetCode detection, local extension storage, authentication, or GitHub synchronization.

## 3.1 Required Technology Stack

Use this stack unless a conflict with the uploaded project is reported before implementation:

| Layer | Required technology |
| --- | --- |
| Programming language | JavaScript using modern ECMAScript modules |
| Extension UI | React |
| Extension framework | WXT |
| Extension standard | WebExtensions with Manifest V3 where supported |
| Architecture | Extension-only; no separate backend service |
| LeetCode integration | WXT content script running only on required LeetCode pages |
| Background processing | WXT background entry point and browser extension service worker |
| Persistent state | Browser extension storage APIs through a cross-browser-compatible wrapper |
| GitHub integration | GitHub HTTPS APIs called directly from the extension |
| Network requests | Native `fetch` unless the existing codebase has a justified compatible abstraction |
| Repository output | Flat solution code files plus one managed root `README.md` |
| Package management | Preserve the lockfile and package manager already used by the uploaded project |
| Testing | Preserve compatible existing test tooling; if none exists, report the missing choice before adding a test framework |

### Stack Constraints

- Do not add Node.js, Express, serverless functions, databases, or any other remote backend.
- Do not migrate the project to TypeScript.
- Do not replace React or WXT with another framework.
- Keep GitHub authentication and repository operations inside the extension.
- Reuse the working GitHub authentication logic after validating that it functions in an extension-only WXT build and does not require a private client secret.
- If the current authentication flow depends on a backend or embedded confidential secret, stop and report the incompatibility instead of silently redesigning authentication.
- Use WXT entry points for the popup, options page when present, content scripts, and background worker.
- Keep synchronization and README-generation logic independent of React components so it can be tested without rendering the UI.
- Keep browser-specific differences isolated from core business logic.
- Do not add a state-management library, styling framework, component library, HTTP client, validation library, or testing framework unless it already exists or the requirement is approved after inspection.

## 4. Accepted-Submission Detection

- Synchronization must start only after a LeetCode submission receives an `Accepted` result.
- Rejected, pending, compile-error, runtime-error, and time-limit-exceeded submissions must not be pushed.
- Detection must tolerate LeetCode client-side navigation and DOM updates.
- Do not depend on a fragile fixed delay as the only detection mechanism.
- Capture the source code exactly as submitted.
- Capture at minimum:
  - LeetCode submission ID
  - Problem title
  - Problem slug or identifier
  - Problem URL
  - Programming language
  - Topic tags
  - Available company tags
  - Submission timestamp

Missing company metadata must not block synchronization.

## 5. Immediate Sync and Persistent Retry Queue

- Create a sync job immediately after detecting an accepted submission.
- Persist the job before sending a GitHub write request.
- Retry recoverable failures automatically.
- Pending jobs must survive browser closure, extension service-worker suspension, extension restart, and temporary loss of internet access.
- Process jobs sequentially for the same repository to prevent concurrent README conflicts.
- Use bounded exponential backoff with jitter for temporary network failures, GitHub rate limits, and GitHub server errors.
- Authentication, authorization, invalid-repository, and invalid-data errors must pause or fail clearly instead of retrying forever.
- Provide a manual retry action for failed jobs.

Required job states:

```text
queued
syncing
retrying
synced
failed
```

## 6. Duplicate Prevention

Use the LeetCode submission ID as the primary event identity. Maintain a stable local synchronization record so that repeated detection of the same accepted event does not create duplicate commits.

If the same problem is accepted again in the same language:

- Replace the existing code file with the latest accepted code.
- Update the existing README entry instead of adding a duplicate row.

A sync job is complete only after GitHub confirms the write and the resulting commit identity is stored.

## 7. GitHub Repository Storage

Store solutions as code files only. Do not create one folder per problem.

Required structure:

```text
README.md
solutions/
  1-two-sum.java
  20-valid-parentheses.cpp
  70-climbing-stairs.py
```

Rules:

- All solution files must be stored directly inside one configured solutions directory.
- Do not create category folders, company folders, problem folders, metadata files, or per-problem README files.
- Each solution file must contain only the submitted source code. Do not inject generated descriptions or metadata into the code.
- Use a deterministic filename derived from the LeetCode problem number, normalized problem slug, and language extension.
- Sanitize filenames to prevent invalid paths and path traversal.
- Use a reliable language-to-extension mapping.
- A later accepted solution for the same problem and language replaces the existing file.
- If the user submits the same problem in a different language, keep one file for each language because their file extensions differ.

## 8. GitHub Write Requirements

- Continue using the existing working GitHub authentication flow unless repository inspection identifies a required correction.
- Use minimum GitHub permissions needed to read and update the selected repository.
- Never hardcode tokens, secrets, repository names, owners, or branch names.
- Never expose authentication data in logs or UI errors.
- Read the current target file state before overwriting it.
- Detect branch-head or file-SHA conflicts.
- On conflict, fetch the latest repository state, rebuild the README from that state, and retry safely.
- Never force-push.
- Never delete user branches or unrelated repository content.
- Do not modify files outside the configured solutions directory and the managed section of the root README.
- When feasible with the selected GitHub API strategy, commit the solution and README update together.

Default commit messages:

```text
sync: add <problem title>
sync: update <problem title>
```

## 9. README Requirements

Maintain the root repository `README.md`.

Problems must be grouped under topic headings:

```md
## Arrays

| # | Problem | File |
|---:|---------|------|
| 1 | [Two Sum](FULL_GITHUB_CODE_FILE_URL) [Amazon] [Google] | [Java](FULL_GITHUB_CODE_FILE_URL) |

## Dynamic Programming

| # | Problem | File |
|---:|---------|------|
| 70 | [Climbing Stairs](FULL_GITHUB_CODE_FILE_URL) [Adobe] | [Python](FULL_GITHUB_CODE_FILE_URL) |
```

README rules:

- Use `## Topic Name` for each topic.
- Each topic must contain a Markdown table with exactly these columns: `#`, `Problem`, and `File`.
- The problem name must be a hyperlink to the full GitHub URL of the solution code file.
- Company names must appear in square brackets after the linked problem name.
- The `File` column must link to the same GitHub code file and display the programming language.
- Use the LeetCode problem number in the `#` column.
- If a problem belongs to multiple topics, list it under every applicable topic.
- If multiple company tags exist, show each company separately after the problem link.
- Do not create duplicate rows for the same problem and language within one topic.
- Keep topic headings in deterministic alphabetical order.
- Keep problems sorted by problem number within each topic.
- Normalize topic and company names consistently.
- Missing company tags must result in no company label; do not invent `Unknown Company`.
- If topic metadata is unavailable, place the entry under `## Uncategorized`.
- Escape Markdown-sensitive text and safely construct GitHub URLs.

## 10. README Ownership and Preservation

The extension must manage only content inside these markers:

```md
<!-- LEETGITSYNC:START -->
<!-- Generated topic sections appear here -->
<!-- LEETGITSYNC:END -->
```

- Preserve all user-written README content outside these markers.
- If both markers exist, replace only the content between them.
- If the markers do not exist, append one managed block without deleting the current README.
- Never create multiple managed blocks.
- README generation must be deterministic: identical input must produce identical Markdown.
- Build the index using the existing managed README data plus the current accepted submission, or another reliable persisted index already present in the inspected project.
- Do not add repository metadata JSON files because solution storage must contain code files only.

## 11. Extension Interface

The extension UI must provide:

- GitHub authentication state.
- Repository and branch configuration.
- Connection or configuration validation.
- Last successfully synchronized problem.
- Current queued or retrying job count.
- Latest failed job with a readable sanitized error.
- Manual retry for failed jobs.
- Disconnect action that clears stored authentication data.

The extension must not inject advertisements or unrelated interface elements in this release.

## 12. Security and Privacy

- Treat all LeetCode page content and repository content as untrusted input.
- Use the minimum required extension and GitHub permissions.
- Restrict host permissions to required LeetCode and GitHub origins.
- Do not use `eval`, remotely hosted executable code, unsafe HTML insertion, or inline scripts forbidden by store policies.
- Apply an appropriate Content Security Policy.
- Never log source code, access tokens, cookies, authorization headers, or full private API responses.
- Never commit extension credentials or private data to the user's repository.
- Redact sensitive values from error messages.
- Validate and sanitize repository paths, filenames, Markdown labels, URLs, topic names, and company names.

## 13. Error Handling

Handle these states explicitly:

| Condition | Required behavior |
| --- | --- |
| Extension not configured | Do not sync; show setup-required state. |
| Accepted solution detected | Persist and queue immediately. |
| Offline or temporary network failure | Retain job and retry with backoff. |
| GitHub rate limit | Respect reset information and delay retry. |
| Authentication expired | Pause sync and require reauthentication. |
| Repository or branch unavailable | Fail clearly without destructive recovery. |
| GitHub conflict | Refetch, regenerate README, and retry safely. |
| Company tags missing | Sync code and omit company labels. |
| Topic tags missing | Sync code under `Uncategorized`. |
| Duplicate accepted event | Do not create another commit. |
| Updated solution | Replace code file and keep one README row per topic and language. |

## 14. Testing Requirements

Add or repair tests appropriate to the project's existing stack.

### Unit Tests

- Accepted-status filtering.
- Language-to-extension mapping.
- Filename normalization and path safety.
- Duplicate event detection.
- Same-problem replacement behavior.
- Topic and company normalization.
- README sorting, grouping, escaping, link generation, and deduplication.
- README marker preservation.
- Retry classification and backoff calculation.

### Integration Tests

- Accepted LeetCode event creates a persistent queue job.
- GitHub authentication and repository configuration validation.
- New code-file creation.
- Existing code-file replacement.
- Different-language solution preservation.
- README update after a successful sync.
- Conflict recovery and GitHub rate-limit behavior.
- Queue recovery after service-worker restart.

### End-to-End Tests

- Authenticate, configure a test repository, submit an accepted solution, and verify the code file and topic README entry.
- Detect the same submission event twice and verify no duplicate commit or row.
- Accept the same problem again and verify the previous file is replaced.
- Sync one problem with multiple topic and company tags and verify every required section and label.
- Verify handwritten README content remains unchanged.

## 15. Implementation Process

Codex must follow this order:

1. Inspect the uploaded project.
2. Document the current architecture and confirmed failures.
3. Protect working GitHub authentication.
4. Create a concise repair-versus-restructure decision for each broken subsystem.
5. Implement accepted-submission detection.
6. Implement persistent queueing, retries, and deduplication.
7. Implement flat solution-file creation and replacement.
8. Implement deterministic README generation.
9. Complete the extension status and configuration UI.
10. Add or repair automated tests.
11. Run lint, type checking, tests, production build, and extension manifest validation.
12. Report changed files, verification results, remaining risks, and store-readiness gaps.

Do not mark the work complete merely because the extension builds. Verify the actual accepted-submission-to-GitHub flow.

## 16. Acceptance Criteria

The project is complete only when all conditions below are met:

- The extension is structured for all major browser stores.
- GitHub authentication works without exposing credentials.
- An accepted LeetCode submission triggers synchronization immediately.
- A durable queue survives browser and service-worker restarts.
- Temporary failures retry safely.
- Each solution is stored as a code file directly inside the configured solutions directory.
- No problem, category, or company folders are created.
- The same problem accepted again replaces the earlier code file for that language.
- Repeated detection of one submission does not create duplicate commits.
- The root README groups problems by topic using the required table format.
- Problem names link to full GitHub code-file URLs.
- Company labels appear after the problem name.
- README content outside the managed markers is preserved.
- Failed jobs are visible and manually retryable.
- No ads or premium features are included in the first release.
- Automated tests and the production build pass.
- The core flow is verified against a test GitHub repository.
