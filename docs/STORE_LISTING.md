# Store listing copy

## Shared listing

**Name:** LeetGitSync

**Short description:** Save accepted LeetCode solutions directly to your GitHub repository.

**Category:** Developer Tools

**Single purpose:** Detect accepted submissions on LeetCode problem pages and synchronize their source code and problem metadata to a GitHub repository selected by the user.

**Detailed description:**

LeetGitSync keeps a personal GitHub solutions repository up to date while you solve LeetCode problems. Connect GitHub with Device Flow, choose an existing repository and branch, and submit normally on LeetCode. When LeetCode reports an accepted result, the extension preserves the submitted code, writes a flat solution file, and updates its managed README index in one GitHub commit.

Features:

- Captures accepted submissions only.
- Supports public and private GitHub repositories.
- Preserves submitted source code and problem metadata.
- Prevents duplicate synchronization and resumes interrupted jobs.
- Pauses safely when offline, unauthorized, misconfigured, or rate limited.
- Runs entirely in the extension without a LeetGitSync backend, analytics, or ads.

LeetGitSync handles accepted source code and problem metadata on LeetCode and sends them directly to the repository configured by the user. Company names appear only when LeetCode provides them. GitHub authorization data and pending synchronization records are kept in browser extension storage. See the published privacy policy for details.

## Chrome Web Store

- Language: English
- Category: Developer Tools
- Privacy-policy URL: publish `PRIVACY.md` at a stable HTTPS URL before submission.
- Website and support: `https://github.com/VisheshAgarwal0089/leetgitsync`
- Supply screenshots and promotional images in the sizes currently required by the Chrome Web Store dashboard.
- Complete the Privacy Practices form using [USER_DATA_DISCLOSURE.md](USER_DATA_DISCLOSURE.md) and [PERMISSION_JUSTIFICATIONS.md](PERMISSION_JUSTIFICATIONS.md).

## Microsoft Edge Add-ons

Use the shared listing and privacy disclosures. In certification notes, explain that reviewers must use their own GitHub and LeetCode accounts because GitHub Device Flow authorizes user-owned repository access; the developer cannot safely provide shared test credentials. Include exact setup and accepted-submission test steps from [INSTALLATION.md](INSTALLATION.md).

## Firefox Add-ons

- Summary: Save accepted LeetCode solutions directly to your GitHub repository.
- Suggested categories: Web Development, Other
- The manifest declares `authenticationInfo` and `websiteContent` data collection for Firefox 140 and newer.
- Upload the generated Firefox source archive with the extension package because WXT bundles the source. Build instructions are in the project README and source archive.

## Brave

Brave installs Chromium-compatible extensions through the Chrome Web Store. Use the Chrome listing for public distribution. The separate Brave package is provided for private-beta/manual testing and is not evidence of approval by a separate Brave store.

## Reviewer test sequence

1. Install the production package and open LeetGitSync.
2. Connect a reviewer-controlled GitHub account through Device Flow.
3. Configure a reviewer-controlled repository with an existing branch, initial commit, and root `README.md`.
4. Validate and save the repository configuration.
5. Open a LeetCode problem, submit a solution, and wait for an accepted result.
6. Confirm the popup shows the queued/synchronized state and the selected repository receives one atomic commit containing the solution and managed README update.
7. Select **Disconnect** and confirm the connected GitHub identity is removed.

Automated release verification uses mocks and never creates a real GitHub commit.
