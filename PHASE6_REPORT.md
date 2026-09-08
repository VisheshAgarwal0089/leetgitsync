# Phase 6 release-readiness report

Status: Phase 6 release hardening and automated verification are complete. Chrome 152 loads the unpacked build, GitHub Device Flow connects successfully, and `VisheshAgarwal0089/leetcode_problems` on `main` validates and saves. A real accepted LeetCode synchronization remains pending; Firefox is not installed on this host.

## Release hardening implemented

- Added reproducible Chrome, Edge and Firefox release ZIP commands. Firefox packaging also emits the source archive required for review.
- Added `scripts/check-release.mjs`, which validates exact versioned artifact names, root manifest placement, required extension entrypoints, safe ZIP paths, and the absence of source maps, environment files and dependencies from store packages.
- Restricted WXT's Firefox source archive to the active extension source, public icons, build configuration, lockfile and review documentation. The inactive legacy TypeScript tree, prior build output, local logs and desktop files are excluded.
- Renamed the npm package identity from the old `githubsync-ai` name to `leetgitsync`, including the lockfile root, so release artifacts have the product name.
- Added the product repository as `homepage_url` in all manifests.
- Corrected Firefox MV3 data-collection disclosure to include both `authenticationInfo` and `websiteContent`. The latter covers accepted source code and problem metadata sent to the user's configured GitHub repository.
- Added `PRIVACY.md` and `SOURCE_CODE_REVIEW.md` for store disclosure and reproducible source review.
- Added a matching disclosure in the repository configuration UI and README. Tokens, cookies, source code and API response bodies remain excluded from logs and UI errors.
- Added repository setup guidance beside the configuration fields: a new empty repository needs an initial commit, and creating a root `README.md` is the simplest initialization path.
- Audited production dependencies and retained the Phase 1 least-permission model: `storage`, `alarms`, GitHub OAuth/API hosts, and a content script limited to LeetCode problem pages.

## Problems found

- The initial Firefox source archive included unrelated workspace content because WXT's default source selection was too broad for this recovered project. An explicit source allowlist now limits the archive to reviewable active files.
- The project and generated archives still used the abandoned `githubsync-ai` package name. They now use `leetgitsync`.
- Firefox declared authentication data transfer but omitted website-content transfer even though accepted solution data is sent to GitHub at the user's request. The manifest now declares both required categories.
- The manifest had no product homepage, and the project had no extension-specific privacy or source-review documentation.
- Chrome 152.0.7977.82 and Edge 152.0.4191.66 are installed on this host. Firefox is not installed, so a real Firefox run cannot be completed here.
- Chrome registered the isolated test profile but ignored both command-line unpacked-extension attempts. This is expected in branded Chrome 137+ because Chrome removed `--load-extension`; the official remaining local path is the Developer mode **Load unpacked** control or a compatible automation protocol. WXT also built its development target successfully but correctly requested a manual unpacked load.
- The Firefox ID `leetgitsync@extensions.local` is a development identity. It must be replaced or reconciled with the final AMO identity before store submission.
- No stable Chromium extension key is committed, which is correct for credential safety but means unpacked installs can receive a different ID when their install context changes. Store publication must preserve the store-assigned identity and OAuth app configuration.
- The selected live destination, `VisheshAgarwal0089/leetcode_problems`, initially had no `HEAD` reference. The user created `main` with an initial commit, and Git now resolves both `HEAD` and `refs/heads/main` to `d77f7ea8d3d44e859e4cbefb2bf82b31ce161b23`.
- Live validation exposed two issues: the original GitHub 404 message was ambiguous, and GitHub's repository `size` can remain zero for a valid tiny repository. Validation now distinguishes an inaccessible repository from a missing branch, treats the branch endpoint as the source of truth, and continues to discard GitHub response bodies.

## Files created or changed

Created:

- `PRIVACY.md`
- `SOURCE_CODE_REVIEW.md`
- `scripts/check-release.mjs`
- `PHASE6_REPORT.md`

Changed:

- `wxt.config.js`: release source allowlist, homepage URL and complete Firefox data-collection declaration.
- `package.json`: LeetGitSync package identity plus Chrome, Edge, Firefox and source ZIP commands and release validation.
- `package-lock.json`: matching package identity.
- `scripts/check-manifest.mjs`: homepage and Firefox disclosure validation.
- `extension/ui/App.jsx`: explicit GitHub transmission disclosure near repository setup.
- `extension/lib/github.js`: safe, distinct repository/branch validation errors and branch-based existence checking.
- `tests/foundation.test.js`: zero-rounded repository-size and missing-branch validation coverage.
- `README.md`: release commands, privacy disclosure and source-review guidance.

No token, OAuth secret, repository credential, signing key or browser cookie was added. The inactive `src` tree and pre-existing user edits remain untouched.

## Commands executed and results

```sh
npm audit --json
npm run lint
npm test
npm run build
npm run build:edge
npm run build:firefox
npm run check:manifest
npm run check:runtime
npm run zip
npm run zip:edge
npm run zip:firefox
npm run check:release
git diff --check
```

- Dependency audit: 0 vulnerabilities across 509 dependencies.
- Lint: passed.
- Tests: 55 passed, 0 failed.
- Chrome MV3 build and ZIP: passed; `leetgitsync-1.0.0-chrome.zip` is 96,553 bytes.
- Edge MV3 build and ZIP: passed; `leetgitsync-1.0.0-edge.zip` is 96,553 bytes.
- Firefox MV3 build, extension ZIP and source ZIP: passed; the archives are 96,624 and 97,872 bytes.
- Manifest validation: passed for Chrome, Edge and Firefox.
- Compiled background-worker validation: passed for Chrome, Edge and Firefox with browser API doubles.
- Release archive validation: passed for all three browser packages and the 44-entry Firefox source archive.
- `git diff --check`: passed; Git only reported working-copy line-ending notices for existing tracked files.

## Live verification status

Automated tests validate Device Flow state, LeetCode request/result correlation, local capture history, durable queue recovery, retry behavior, GitHub request payloads, deterministic README generation, atomic Git-data commits and safe errors. They use browser and GitHub API doubles and do not make repository changes.

Verified in installed Chrome 152.0.7977.82:

- `.output/chrome-mv3` loads as an unpacked extension through Developer mode.
- The LeetGitSync action opens its React popup.
- The popup renders GitHub connection controls, an empty synchronization queue, repository fields, save/validate controls, the GitHub data-transmission disclosure and the full-settings link.

The following installed-browser checks remain pending:

- Inspect the full Chrome settings page and verify saved settings persist after closing and reopening extension UI.
- Load and inspect the unpacked Edge build.
- Validate authenticated write access to `VisheshAgarwal0089/leetcode_problems` on `main` without exposing the token.
- Capture a real accepted LeetCode submission and confirm one atomic solution-plus-README commit.
- Exercise same-language replacement, different-language preservation, an identical retry, browser restart, offline recovery, a protected branch and a concurrent branch-head update.
- Repeat the flow in Firefox once Firefox is available.

Live Chrome repository validation and save now pass for `VisheshAgarwal0089/leetcode_problems` on `main` after its initial commit. The popup reports successful validation, and the user confirmed the configuration was saved.

These live checks can change the configured GitHub repository. A dedicated branch is recommended for destructive-free verification; the extension never force-updates a branch.

On this host, Chrome live verification must continue manually from `chrome://extensions`: enable Developer mode and load `.output/chrome-mv3`. The current Codex UI bridge exposes only its in-app browser and cannot inspect the native Chrome window. Chrome documents the command-line restriction and supported alternatives in its [June 2025 extensions update](https://developer.chrome.com/blog/extension-news-june-2025).

## Store and compatibility risks

- The current GitHub OAuth app must have Device Flow enabled and must remain configured for the final extension/store identity. Organization OAuth restrictions may still reject repository access.
- Protected branches, required signed commits, rulesets or workflow restrictions can reject Git-data writes even after read/write repository validation.
- LeetCode may change its internal submission endpoints or metadata response shapes. Extraction remains isolated under `extension/leetcode`, but current behavior still needs a live accepted submission in each browser.
- Firefox's built-in data-consent manifest key requires Firefox 140+, which is reflected in `strict_min_version`. Supporting older Firefox versions would require a different consent and compatibility plan.
- Store listing text, screenshots, final OAuth application ownership, Firefox add-on ID and signing accounts are external release inputs and are not stored in the repository.

## Proposed Phase 7 scope

Phase 7 should begin only after the pending live integration matrix is complete. It should contain fixes demonstrated by those runs, final store metadata and signing preparation, and a release checklist tied to exact browser versions and test commit SHAs. It should not add a backend, database, analytics, ads, premium features, metadata files or unrelated dashboard work.
