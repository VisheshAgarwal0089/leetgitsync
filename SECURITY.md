# Security Policy

## Supported version

Security fixes currently target the latest version on the `main` branch.

## Reporting a vulnerability

Please do not open a public issue for a suspected security vulnerability.

Instead, use GitHub's private vulnerability reporting feature if it is enabled for this repository. If private reporting is unavailable, contact the repository owner through the GitHub profile.

When reporting, include:

- the affected area or file
- clear reproduction steps
- expected vs. actual behavior
- potential impact
- any suggested mitigation, if known

## Security model

LeetGitSync runs as a browser extension and has no application backend.

Important boundaries:

- GitHub authentication uses Device Flow.
- Authentication data and synchronization state are stored in browser extension storage.
- Accepted submission source code is sent only to the GitHub repository configured by the user.
- The extension communicates with GitHub and LeetCode endpoints required for authorization, metadata capture, and synchronization.
- Secrets must never be committed to this repository.

See [PRIVACY.md](PRIVACY.md) for the data-handling model.

## Dependency and release hygiene

Before publishing a release:

- run the automated tests
- run lint and manifest/runtime checks
- run the sensitive-data check
- review requested browser permissions
- verify no local configuration or credentials are included
