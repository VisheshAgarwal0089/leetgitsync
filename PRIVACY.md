# LeetGitSync privacy information

LeetGitSync runs entirely in the browser extension. It has no LeetGitSync backend, database, advertising, analytics or telemetry service.

## Data stored in the browser

The extension stores the GitHub access token obtained through GitHub Device Flow, the connected GitHub account identifier, repository settings, accepted-submission capture history and the durable synchronization queue in browser extension storage. Accepted-submission records include source code and problem metadata so interrupted synchronization can resume after the browser or extension worker restarts.

Disconnecting GitHub removes locally stored authentication data. Repository settings and non-authentication capture/queue history remain in extension storage. Removing the extension clears data according to the browser's extension-storage behavior.

## Data sent outside the extension

The extension communicates only with:

- GitHub OAuth endpoints to authorize the user's GitHub account.
- GitHub REST API endpoints to verify the configured repository and synchronize accepted source code and generated README content to that repository.
- LeetCode's same-origin endpoints while running on a LeetCode problem page to obtain submission results and problem metadata.

Accepted source code, problem title and number, language, topic tags and available company tags are sent to GitHub only for the repository, branch and solutions directory configured by the user. LeetGitSync does not sell or share this data for advertising, profiling or analytics.

## Permissions

- `storage` keeps authentication, configuration, capture history and pending jobs across restarts.
- `alarms` resumes GitHub authorization polling and delayed synchronization retries.
- Access to `https://leetcode.com/problems/*` detects accepted submissions and reads problem metadata.
- Access to `https://github.com/*` and `https://api.github.com/*` performs Device Flow authorization and repository synchronization.

GitHub and LeetCode process requests under their own privacy policies. Users control the destination repository and can revoke the OAuth application's access through GitHub account settings.
