# Permission justifications

LeetGitSync has one purpose: save accepted LeetCode solutions directly to a GitHub repository selected by the user.

| Permission or match | Justification |
| --- | --- |
| `storage` | Stores the GitHub token, repository selection, bounded capture history, and durable queue so authorization and synchronization survive browser restarts. |
| `alarms` | Resumes GitHub Device Flow polling and bounded retry delays after a Manifest V3 service worker is suspended. |
| `https://leetcode.com/problems/*` and `https://leetcode.com/contest/*/problems/*` | Runs only on normal and contest problem routes to detect accepted submissions and collect code and metadata. Contest jobs remain held until a verified contest end time. |
| `https://github.com/*` | Calls GitHub's Device Flow authorization endpoints. |
| `https://api.github.com/*` | Identifies the connected account, validates the selected repository and branch, and creates the atomic solution/README commit. |

The extension does not request `tabs`, `activeTab`, `cookies`, browsing history, downloads, clipboard, `scripting`, `webRequest`, native messaging, or `<all_urls>`. It does not expose externally connectable endpoints or web-accessible extension resources.

GitHub's `repo` OAuth scope is required because the product supports user-selected private repositories. A public-repository-only release could use `public_repo`, but that would remove advertised private-repository support.
