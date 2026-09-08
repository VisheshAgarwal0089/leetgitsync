# Phase 7 implementation report

Status: Phase 7 store and release preparation is implemented and automated checks pass. Publication remains blocked until the accepted-LeetCode-submission-to-GitHub flow is verified live and store-owned identities, screenshots and publisher details are supplied.

## What was implemented

- Added one store-listing draft covering LeetGitSync's single purpose, user-facing behavior, limitations, permission justifications, data handling, listing URLs, suggested categories, visual assets and reviewer notes.
- Added a release checklist with automated preflight, the live Chrome evidence already established, the remaining Chrome/Edge/Firefox matrix, store-account work and exact artifact evidence fields.
- Added `check:store`, which verifies that store copy contains the required single-purpose, permission and data-disclosure sections; privacy documentation describes authentication, source, metadata, storage and removal; the checklist version matches `package.json`; browser versions and live evidence fields are present; and documentation does not resemble a committed token or client secret.
- Recorded exact SHA-256 checksums for every version 1.0.0 release artifact.
- Updated the README to expose the store-readiness command and link release documents.
- Corrected the Phase 6 status to record successful live GitHub Device Flow, repository validation and saved configuration.

The listing copy follows current store guidance: Chrome requires accurate listing/privacy disclosure and least permissions, Edge requires a clear single purpose and data handling, and Firefox requires a privacy policy and reviewable sources when data leaves the device. References: [Chrome Web Store policies](https://developer.chrome.com/docs/webstore/program-policies/policies), [Microsoft Edge extension policies](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies), [Firefox submission guidance](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/), and [Firefox built-in data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).

## Files created or changed

Created:

- `STORE_LISTING.md`
- `RELEASE_CHECKLIST.md`
- `scripts/check-store-readiness.mjs`
- `PHASE7_REPORT.md`

Changed:

- `package.json`: added `check:store`.
- `README.md`: documented the new check and release documents.
- `PHASE6_REPORT.md`: recorded successful authentication, validation and saved configuration.

No store submission, signing operation, GitHub repository write, OAuth credential change or publisher-account change was performed.

## Verification results

- ESLint: passed.
- Tests: 55 passed, 0 failed.
- Chrome, Edge and Firefox MV3 production builds: passed through their ZIP commands.
- Manifest validation: passed for all browsers.
- Compiled worker validation: passed for all browsers with browser API doubles.
- Release archive validation: passed for all browser packages and Firefox sources.
- Store documentation validation: passed.
- `git diff --check`: passed with only existing Windows line-ending notices.

Release artifacts:

- `leetgitsync-1.0.0-chrome.zip`: 96,553 bytes.
- `leetgitsync-1.0.0-edge.zip`: 96,553 bytes.
- `leetgitsync-1.0.0-firefox.zip`: 96,624 bytes.
- `leetgitsync-1.0.0-sources.zip`: 97,963 bytes.

Exact SHA-256 values are recorded in `RELEASE_CHECKLIST.md`.

## Remaining release blockers

- A real accepted LeetCode submission has not yet produced and verified an atomic code-plus-README commit in `VisheshAgarwal0089/leetcode_problems`.
- Duplicate event, same-language replacement, different-language preservation, restart recovery, offline retry and protected-branch behavior remain live-test items.
- Edge has not loaded the unpacked build. Firefox is not installed on this host.
- Chrome/Edge screenshots, promotional artwork, publisher/support contact, chosen license, store accounts and final store-assigned identities are external inputs.
- The Firefox development ID must be reconciled with the final AMO identity before submission.

## Exact Phase 8 scope

Phase 8 is the live certification gate:

1. Reload the current Chrome build and confirm saved configuration persists.
2. Submit an accepted LeetCode solution and verify the captured submission ID, flat solution path, one atomic Git commit and managed README row in the configured repository.
3. Run the duplicate, rejected, replacement, second-language, restart and temporary-offline checks without logging source or credentials.
4. Apply only fixes demonstrated by those live runs and repeat automated checks.
5. Repeat the core flow in Edge and Firefox when available.
6. Capture sanitized store screenshots and fill exact commit/browser evidence in `RELEASE_CHECKLIST.md`.

Phase 8 does not publish to a store without explicit authorization and final publisher inputs. It does not add a backend, database, analytics, ads, premium features or unrelated product work.
