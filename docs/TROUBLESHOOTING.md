# Troubleshooting

## Repository validation fails

Confirm the owner, repository, branch, and capitalization. The branch must contain an initial commit; creating a root `README.md` is the simplest setup. For a private repository, confirm the connected account and organization policy allow the OAuth application to access it.

## An accepted submission does not appear

Reload the LeetCode problem tab after installing or updating an unpacked build. Confirm the page URL starts with `https://leetcode.com/problems/`, the extension is enabled for the site, and the result is final and accepted. LeetGitSync intentionally ignores pending, wrong-answer, runtime, compilation, and time-limit results.

## The queue is paused

- **Offline:** restore the connection; the queue resumes automatically.
- **Authentication expired:** reconnect GitHub.
- **Repository configuration required:** validate and save a repository.
- **Rate limited:** wait until the displayed GitHub reset time; processing resumes automatically.
- **Queue full:** allow pending work to finish and resolve failed jobs before submitting more solutions.
- **Migration failed:** do not clear storage. Open an issue with the browser version and the sanitized error code shown in the popup.

## A job keeps retrying or fails

Transient network errors use bounded exponential backoff. GitHub branch conflicts are retried at most three times. Confirm that the branch still exists and the connected account can write to it. Failed jobs are retained rather than silently deleted.

## Disconnect and removal

**Disconnect** removes GitHub authentication and stops writes until reconnection. It intentionally preserves repository settings and queued/history records. Revoke the OAuth application in GitHub settings if immediate server-side invalidation is required. Uninstalling the extension removes its local storage according to browser behavior; already synchronized GitHub files must be removed in GitHub.

## Reporting a problem

Open an issue at `https://github.com/VisheshAgarwal0089/leetgitsync/issues`. Include the browser/version, extension version, LeetCode problem URL, visible queue state, and sanitized error code. Never include source code, access tokens, cookies, authorization headers, device codes, or private API responses.
