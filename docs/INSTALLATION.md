# Installation and setup

## Store installation

Install LeetGitSync from the browser's extension store after a listing is published. No store listing is claimed or linked before approval. Pinning the toolbar action makes queue status easier to view.

## Private-beta installation

Use the unpacked folder for the target browser:

- Chrome: `.output/chrome-mv3`
- Edge: `.output/edge-mv3`
- Firefox: `.output/firefox-mv3`
- Brave: `.output/brave-mv3`

Enable developer mode on the browser's extensions page and load the matching unpacked folder. Firefox may require a temporary add-on install from `about:debugging` unless the package has been signed by Mozilla.

## GitHub and repository setup

1. Create or choose the GitHub repository that will hold solutions.
2. Ensure the target branch exists and has an initial commit. A root `README.md` is the simplest initial file; it may be otherwise empty.
3. Open LeetGitSync and select **Connect GitHub**.
4. Follow the GitHub Device Flow prompt. LeetGitSync never asks you to paste a token.
5. Enter the GitHub owner, repository name, target branch, and solutions directory.
6. Select **Validate repository**, then **Save configuration**.

Changing the repository or branch while jobs are pending requires explicit confirmation. Existing jobs retain their original destination and are never silently redirected.

## Verify synchronization

Open a LeetCode problem and submit a solution. Rejected or pending submissions are ignored. After an accepted result, open the popup to see the queue state. LeetGitSync creates or replaces the flat solution file for that problem and language and updates the managed README in the same GitHub commit.

Company names are added only when LeetCode provides them. Their absence does not prevent capture or synchronization.
