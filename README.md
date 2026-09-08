# LeetGitSync

LeetGitSync is a browser extension that automatically saves accepted LeetCode solutions to a GitHub repository. It keeps your solution files and a generated README index up to date without requiring a separate server.

## Features

- Detects accepted submissions on LeetCode
- Preserves submitted source code and problem metadata
- Syncs solutions directly to a configured GitHub repository
- Supports public and private repositories through GitHub Device Flow
- Prevents duplicate captures and safely retries interrupted syncs
- Works with Chrome, Edge, and Firefox
- Stores configuration and queue state in browser extension storage

## Setup

1. Install or load the extension in your browser.
2. Open LeetGitSync and connect your GitHub account.
3. Enter the repository owner, repository name, target branch, and solutions directory.
4. Validate and save the configuration.
5. Submit a solution on LeetCode. Accepted submissions will be added to the configured repository.

The target repository must contain an initial commit and a `README.md` file before it can be validated.

## Local development

LeetGitSync uses JavaScript, React, WXT, and Manifest V3. Node.js 22.12 or newer is recommended.

```sh
npm ci
npm run dev
```

Create production builds with:

```sh
npm run build
npm run build:edge
npm run build:firefox
```

The unpacked Chromium extension is generated in `.output/chrome-mv3`.

## Privacy

LeetGitSync runs entirely in the browser. It has no backend or database. GitHub credentials remain in extension storage, and captured solutions are sent only to the repository selected by the user. See [PRIVACY.md](PRIVACY.md) for details.
