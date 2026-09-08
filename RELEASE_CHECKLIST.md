# LeetGitSync release checklist

Version under review: 1.0.0

## Automated preflight

- [x] npm lockfile installs the active WXT project.
- [x] ESLint passes.
- [x] All 55 tests pass.
- [x] Chrome, Edge and Firefox Manifest V3 builds pass.
- [x] Generated manifests and compiled workers pass validation.
- [x] npm audit reports zero known vulnerabilities.
- [x] Chrome, Edge, Firefox and Firefox source archives pass structural validation.
- [x] Manifest permissions are limited to `storage`, `alarms`, LeetCode problem pages and GitHub OAuth/API hosts.
- [x] Privacy policy and store-listing data disclosure cover GitHub authentication, accepted website content and local durable storage.

## Verified live setup

- [x] Chrome 152.0.7977.82 loads `.output/chrome-mv3` as an unpacked extension.
- [x] Popup renders and GitHub Device Flow connects as `VisheshAgarwal0089`.
- [x] `VisheshAgarwal0089/leetcode_problems` exists and `main` resolves to an initial commit.
- [x] Authenticated repository validation succeeds and settings save.
- [ ] Close and reopen the popup and full settings page; confirm owner, repository, branch and directory persist.
- [ ] Submit one accepted solution from a LeetCode problem page and record the submission ID and resulting GitHub commit SHA without recording source code in this checklist.
- [ ] Confirm one flat solution file exists under `solutions/` and the same commit updates the root README managed block.
- [ ] Confirm a rejected submission creates no history item, queue job or GitHub commit.
- [ ] Repeat the exact accepted event and confirm no duplicate commit or README row.
- [ ] Resubmit the same problem/language with changed code and confirm replacement.
- [ ] Submit a different language and confirm both language files remain.
- [ ] Restart Chrome with a queued job and confirm recovery.
- [ ] Verify a temporary offline failure retries and a protected-branch failure is visible and manually retryable.

## Browser matrix

- [ ] Chrome: complete every live core-flow item above.
- [ ] Edge 152.0.4191.66: load the Edge build and repeat authentication, persistence, accepted capture and atomic commit.
- [ ] Firefox 140+: install Firefox, verify built-in `authenticationInfo` and `websiteContent` consent, and repeat the core flow.

## Store preparation

- [ ] Confirm ownership and production configuration of the GitHub OAuth application whose client ID is already used by the working Device Flow.
- [ ] Reserve the Chrome Web Store, Microsoft Edge Add-ons and Firefox Add-ons listings under the intended publisher accounts.
- [ ] Replace `leetgitsync@extensions.local` with the final AMO extension identity before the first Firefox submission.
- [ ] Host `PRIVACY.md` at the stable public URL recorded in `STORE_LISTING.md`.
- [ ] Capture required screenshots only after the live flow passes; exclude tokens, Device Flow codes and private repository content.
- [ ] Select the appropriate store license and publisher/support contact. No license or email is inferred by the codebase.
- [ ] Upload the browser-specific ZIP, and upload the Firefox sources ZIP with `SOURCE_CODE_REVIEW.md` instructions.
- [ ] Copy the permission explanations and data disclosures from `STORE_LISTING.md` into each store dashboard.
- [ ] Save store-assigned extension IDs and update OAuth/store configuration without committing signing keys or secrets.
- [ ] Complete store review before describing version 1.0.0 as generally available.

## Release evidence

Record exact evidence here after live verification:

- LeetCode submission ID:
- GitHub commit SHA and URL:
- Chrome result/date:
- Edge result/date:
- Firefox result/date:
- Store package checksums:
  - Chrome: `625B99FDBEF35B22C42AFFC892703CA793A71B289315E4BD7905B2BD342B4237`
  - Edge: `625B99FDBEF35B22C42AFFC892703CA793A71B289315E4BD7905B2BD342B4237`
  - Firefox: `7B6815652ECEB86F4C22EA7A0949B9E4DD345AD337DC2DFFB0E7E803B09FFACA`
  - Firefox sources: `D6BEAC73C733898A1244C85E234C47FA3D1B752B8981AC9D87C8EF1BDE0C10CE`
- Known release blockers:
