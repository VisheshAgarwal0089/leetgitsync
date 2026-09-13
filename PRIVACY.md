# LeetGitSync privacy policy

Effective: September 9, 2026

LeetGitSync saves accepted LeetCode submissions to a GitHub repository selected by the user. It runs entirely as a browser extension and has no LeetGitSync server, database, advertising, analytics, tracking, or telemetry service.

## Data handled by the extension

LeetGitSync stores the following in browser extension storage:

- The GitHub access token returned by GitHub Device Flow and the connected GitHub account identifier.
- The selected repository owner, repository, branch, and solutions directory.
- A bounded history of accepted submissions, including submitted source code and problem metadata.
- Pending and failed synchronization jobs, retry and rate-limit state, and sanitized operational status.

This local state allows interrupted work to resume after a browser or extension service-worker restart. LeetGitSync never puts the access token, submitted source code, cookies, authorization headers, device codes, or complete private API responses in diagnostics or UI errors.

## Data sent outside the extension

LeetGitSync communicates only with GitHub and LeetCode:

- GitHub's OAuth endpoints authorize the user's account through Device Flow.
- GitHub's REST API verifies the selected repository and writes accepted source code, problem metadata, and the managed README directly to that repository.
- LeetCode's same-origin endpoints are observed from LeetCode problem pages to determine submission results and obtain problem metadata.

For an accepted submission, LeetGitSync may send GitHub the submission identifier, problem number, title, slug and URL, language, submitted source code, topic tags, submission timestamps, and company names. Company names are included only when LeetCode provides them. Missing company names do not prevent synchronization.

LeetGitSync does not send this data to the extension developer. It does not sell or use data for advertising, profiling, credit decisions, or analytics. GitHub and LeetCode process requests under their own privacy policies.

## GitHub authorization and private repositories

The extension uses GitHub Device Flow, so the user authorizes on GitHub and no GitHub client secret is embedded in the extension. The requested `repo` OAuth scope supports both public and private repositories. Although that scope can grant access to repositories allowed by the GitHub account or organization, LeetGitSync sends repository API requests only for the repository and branch saved by the user.

The access token is stored in browser extension storage. Selecting **Disconnect** removes the token, connected-account details, and any in-progress Device Flow data. Repository configuration and existing queue/history records remain so they are not silently lost. The user can remove those remaining records by uninstalling the extension, subject to the browser's extension-storage behavior.

## User choices and deletion

The user chooses the GitHub account, repository, branch, and solutions directory. Saving repository configuration after the in-product disclosure enables synchronization to that destination. The user can disconnect GitHub at any time, revoke the OAuth application's access in GitHub settings, delete synchronized files from the repository, or uninstall LeetGitSync to remove extension storage according to browser behavior.

## Permissions

- `storage` preserves authentication, configuration, bounded capture history, and synchronization jobs across restarts.
- `alarms` resumes Device Flow polling and delayed synchronization retries when the service worker is suspended.
- `https://leetcode.com/problems/*` and `https://leetcode.com/contest/*/problems/*` detect accepted submissions and obtain problem metadata on normal and contest problem pages. Contest code remains local until a verified contest end time; if that time is unavailable, publishing stays paused.
- `https://github.com/*` performs GitHub Device Flow authorization.
- `https://api.github.com/*` verifies and writes to the selected GitHub repository.

LeetGitSync does not request browsing history, tabs, cookies, downloads, clipboard, `webRequest`, or access to all websites.

## Policy updates and contact

Material changes will be published with an updated effective date. Privacy questions and deletion-support requests can be filed through the [LeetGitSync issue tracker](https://github.com/VisheshAgarwal0089/leetgitsync/issues).
