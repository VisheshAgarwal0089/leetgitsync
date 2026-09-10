# User-data disclosure

Use this disclosure consistently in browser-store privacy forms and reviewer notes.

## Prominent disclosure

LeetGitSync reads accepted LeetCode submission results, submitted source code, and problem metadata on LeetCode problem pages. After the user connects GitHub and saves a repository configuration, the extension sends that source code and metadata directly to the selected GitHub repository. Company names are included only when LeetCode provides them. No data is sent to the LeetGitSync developer, advertisers, analytics providers, or any LeetGitSync server.

## Data categories and purposes

- **Authentication information:** GitHub OAuth access token and connected account ID, used only to authenticate repository requests.
- **Website content:** submitted source code, submission result and ID, problem details, topic tags, available company names, and timestamps, used only to capture an accepted solution and synchronize it to GitHub.
- **User configuration:** repository owner, repository, branch, and solutions directory, used only to select the destination.
- **Operational state:** bounded queue, retry, rate-limit, capture-history, and sanitized status records, used only for reliable synchronization.

Authentication, configuration, queue, and bounded history are stored in browser extension storage. Source code is retained locally only as part of bounded capture or pending/failed synchronization records. Successful history is removed by the deterministic retention policy.

## Transfers and handling

- GitHub authorization uses `https://github.com/`.
- Repository validation and synchronization use `https://api.github.com/`.
- Submission and problem requests use LeetCode's same-origin endpoints while the user is on `https://leetcode.com/problems/*`.
- Data is encrypted in transit by HTTPS.
- Data is not sold, used for advertising, or transferred to the extension developer.

The extension observes requests made by the LeetCode page. Browser-managed LeetCode cookies may accompany same-origin requests, but LeetGitSync does not read, store, or log cookie values.

## Controls

Disconnect removes the GitHub token, account details, and Device Flow state. It leaves repository settings and queued/history records to avoid silent data loss. Revoking the OAuth application in GitHub invalidates its access. Uninstalling the extension removes local extension data according to browser behavior; repository files remain under the user's GitHub controls.

The complete policy is [PRIVACY.md](../PRIVACY.md).
