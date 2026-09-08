# LeetGitSync store-listing draft

Status: copy is prepared for Chrome Web Store, Microsoft Edge Add-ons and Firefox Add-ons. Do not submit it until the live accepted-submission check in `RELEASE_CHECKLIST.md` passes.

## Name

LeetGitSync

## Short summary

Save accepted LeetCode solutions and a topic index directly to your GitHub repository.

## Single purpose

LeetGitSync detects an accepted submission on a LeetCode problem page and synchronizes that submitted source code to a GitHub repository, branch and solutions directory selected by the user. It also maintains a topic-grouped section of the repository's root README in the same commit.

## Detailed description

LeetGitSync keeps accepted LeetCode solutions in your own GitHub repository without a LeetGitSync server.

- Connect a GitHub account through GitHub Device Flow.
- Select an existing repository and target branch. A new empty repository needs an initial commit; creating a root `README.md` is the simplest setup.
- Capture accepted LeetCode submissions while ignoring pending and unsuccessful results.
- Store each language in a flat file inside the selected solutions directory.
- Update the solution and managed README topic index together in one Git commit.
- Recover pending synchronization work after browser or service-worker restarts.
- Retry temporary network and rate-limit failures with bounded backoff.
- Review synchronization status and retry failed jobs from the extension UI.

LeetGitSync has no backend, advertising, analytics, premium feature or payment. Repository rules, protected branches and organization OAuth restrictions can prevent writes.

## Permission justifications

- `storage`: stores the GitHub session, repository configuration, a limited accepted-submission history and the durable synchronization queue in extension storage.
- `alarms`: resumes Device Flow polling and delayed synchronization retries when the Manifest V3 worker is suspended.
- `https://leetcode.com/problems/*`: observes submission responses and reads metadata only on LeetCode problem pages.
- `https://github.com/*`: performs GitHub Device Flow authorization.
- `https://api.github.com/*`: validates the selected repository and writes solution/README commits.

No permission is requested for general browsing history, tabs, arbitrary websites, downloads, clipboard access or native applications.

## Data disclosure

The extension stores a GitHub access token in browser extension storage and uses it only from the background worker. It stores accepted source code and problem metadata locally so queued work can survive restarts. It transmits accepted source code and the generated README content only to GitHub for the repository chosen by the user. LeetCode requests stay on LeetCode. It has no developer-operated server or telemetry.

The user can disconnect GitHub to remove locally stored authentication. Removing the extension clears extension storage according to browser behavior. Full details are in the [privacy policy](https://github.com/VisheshAgarwal0089/leetgitsync/blob/v2/PRIVACY.md).

Firefox manifest disclosure categories: `authenticationInfo` and `websiteContent` are required. Firefox desktop 140 or newer is required for built-in data-transmission consent.

## Listing links

- Homepage: https://github.com/VisheshAgarwal0089/leetgitsync
- Support: https://github.com/VisheshAgarwal0089/leetgitsync/issues
- Privacy policy: https://github.com/VisheshAgarwal0089/leetgitsync/blob/v2/PRIVACY.md

## Suggested categories

- Chrome and Edge: Developer Tools
- Firefox: Web Development or Other

## Visual assets still required

- At least one clear screenshot showing connected status, validated repository settings and the synchronization queue without exposing a token or Device Flow code.
- A screenshot showing a successful synchronization and commit link, captured only after live end-to-end verification.
- Store-specific promotional artwork where required. Use the existing product icon as the visual source and do not use LeetCode or GitHub logos as if LeetGitSync were an official product.

## Reviewer notes

LeetGitSync uses GitHub's public Device Flow OAuth application identifier; there is no client secret. Reviewers can use their own GitHub account and a disposable repository with an initialized branch. Build instructions are in `SOURCE_CODE_REVIEW.md`. The managed README block is bounded by `<!-- LEETGITSYNC:START -->` and `<!-- LEETGITSYNC:END -->`; content outside it is preserved.

No reviewer account credentials belong in this repository. Add any store-specific testing credentials only through the store's private reviewer-notes field.
