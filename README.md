# LeetGitSync

LeetGitSync is an extension-only JavaScript, React, WXT and Manifest V3 project. Phase 1 provides GitHub Device Flow authentication and repository configuration. Phase 2 captures accepted LeetCode submissions. Phase 3 persists one restart-safe synchronization job per capture. Phase 4 introduced GitHub solution writes. Phase 5 atomically commits each flat solution file together with a deterministic managed root README index.

## Build and checks

Use Node.js 22.12+ (verified with Node 24.13) and the existing npm lockfile:

```sh
npm ci
npm run lint
npm test
npm run build
npm run build:edge
npm run build:firefox
npm run check:manifest
npm run check:runtime
npm run check:store
npm run zip
npm run zip:edge
npm run zip:firefox
npm run check:release
```

The runtime check executes production workers with browser API doubles; it does not replace an installed-extension test. `npm run dev` and `npm run dev:firefox` launch WXT development tooling. `npm run icons` regenerates the existing icons.

On this machine the default npm PowerShell shim failed. The working invocation was `& 'C:/Program Files/nodejs/npm.cmd' <arguments>`.

## Load locally

1. Chrome 120+: open `chrome://extensions`, enable Developer mode, choose Load unpacked, and select `.output/chrome-mv3`.
2. Edge 120+: open `edge://extensions`, enable Developer mode, choose Load unpacked, and select `.output/edge-mv3`.
3. Firefox desktop 140+: open `about:debugging#/runtime/this-firefox`, choose Load Temporary Add-on, and select `.output/firefox-mv3/manifest.json`. Temporary installations are removed when Firefox closes.

Do not load the old `dist` build: it contains the earlier implementation. Disable the older installed extension while testing so its old synchronization handler cannot run alongside Phase 1.

Loading an unpacked extension from a different directory can change its extension ID and storage area. Legacy authentication is migrated only when previous storage is available under the same extension identity. Otherwise reconnect normally; never copy tokens into source files or logs. Preserve the same ID for published updates. The Firefox ID in `wxt.config.js` is the initial development identity and must be reconciled with any existing store identity before release.

## Set up

1. Open the popup and choose Connect GitHub.
2. Follow Open GitHub authorization, enter the displayed code, and authorize the existing OAuth app. Return to the popup/settings. Polling persists while the popup is closed.
3. Enter the GitHub owner, repository name, existing target branch, and relative solutions directory. A new empty repository needs an initial commit before validation; creating a root `README.md` is the simplest setup.
4. Validate repository checks current write access and branch existence without writing files. Save configuration persists values locally. Validation does not save changes.
5. Reopen to check persistence. Verify connection checks the stored GitHub session. Disconnect clears local authentication while retaining repository configuration; it does not revoke the app on GitHub.

Accepted submission capture is enabled on `https://leetcode.com/problems/*`. Captured records are stored newest-first under `lgs-captures-v1`, limited to 50 records and approximately 4 MB. Durable jobs are stored under `lgs-sync-queue-v1`, limited to 200 without evicting active jobs. Configured jobs create or update `<number>-<slug>.<extension>` directly inside the solutions directory and regenerate only the root README content between `<!-- LEETGITSYNC:START -->` and `<!-- LEETGITSYNC:END -->`. Both files enter one Git tree and commit, followed by a non-force branch update. An identical retry creates no Git objects and records the current branch commit. The popup/settings show active queue count, latest failure, last success with a commit link, and manual retry.

## Active source and reuse

- `wxt.config.js`: build and manifest configuration.
- `extension/entrypoints`: JavaScript background/content scripts and React popup/options pages.
- `extension/lib`: browser adapter, errors, validation, storage migration, GitHub requests and authentication lifecycle.
- `extension/leetcode`: isolated request/result correlation, metadata extraction, selectors, navigation handling, record validation and capture orchestration.
- `extension/sync`: durable jobs, safe paths and language extensions, managed README parsing/rendering, atomic Git-data commits, conflict regeneration, restart recovery, error classification and bounded backoff.
- `extension/ui`: shared setup UI and JavaScript adaptations of the original button/card/input components and theme, without remote fonts.
- `tests/foundation.test.js`: Node built-in tests; no new test framework.
- `scripts/check-manifest.mjs` and `scripts/check-runtime.mjs`: artifact checks.

The original `src` tree, TypeScript/CRXJS configuration and pre-existing edits remain as inactive reference material. WXT discovers only `extension/entrypoints`; active code does not import TypeScript or the old sync engine. Existing dependencies remain for later recovery work.

## Authentication and permissions

The existing public client ID and form-encoded GitHub Device Flow requests are preserved. There is no confidential client secret or backend. New authorizations request `repo` for public/private repository access; unnecessary `user` and `read:org` scopes were removed. Existing tokens retain their original scopes until reauthorized.

Tokens remain in extension-local storage and background requests. UI responses omit tokens and private device codes. Logs/errors omit API payloads. Chromium storage access is restricted to trusted extension contexts. The page bridge carries only versioned submission candidates; content scripts cannot access credentials. Accepted source code and problem metadata are transmitted only to GitHub for the repository synchronization the user configures.

Permissions are `storage` and `alarms`, plus GitHub OAuth/API hosts. The sole content match is `https://leetcode.com/problems/*`. Firefox uses WXT's MV3 background event page, declares required `authenticationInfo` and `websiteContent` transmission, and requires version 140+ for built-in consent. See [PRIVACY.md](PRIVACY.md).

Release listing copy and the remaining live/store gates are in [STORE_LISTING.md](STORE_LISTING.md) and [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). See [PHASE1_REPORT.md](PHASE1_REPORT.md), [PHASE2_REPORT.md](PHASE2_REPORT.md), [PHASE3_REPORT.md](PHASE3_REPORT.md), [PHASE4_REPORT.md](PHASE4_REPORT.md), [PHASE5_REPORT.md](PHASE5_REPORT.md), [PHASE6_REPORT.md](PHASE6_REPORT.md), and [PHASE7_REPORT.md](PHASE7_REPORT.md) for findings, results and remaining verification.
