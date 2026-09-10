# Release checklist

## Before packaging

- [ ] Confirm the release commit and clean working tree.
- [ ] Set a version higher than every version previously submitted to each store.
- [ ] Confirm the production GitHub OAuth client ID and callback configuration; never add a client secret.
- [ ] Run `npm ci` with the supported Node.js version.
- [ ] Run `npm run release:verify` and retain its console summary.
- [ ] Review the 1,000-installation simulation as a mocked architecture test, not real load testing.

## Package review

- [ ] Match name, version, description, icons, permissions, CSP, and functionality across browser packages.
- [ ] Confirm no source maps, `.env` files, tests, development controls, tokens, submitted code, or private responses are in extension archives.
- [ ] Confirm each archive checksum matches `.output/SHA256SUMS.txt`.
- [ ] Smoke-test each unpacked production build and exercise GitHub disconnect.
- [ ] Upload the Firefox source archive and reproducible build instructions with the Firefox package.

## Store materials

- [ ] Publish `PRIVACY.md` at a stable public HTTPS URL.
- [ ] Complete each store's current data-use, permission, and remote-code declarations.
- [ ] Capture current screenshots and required promotional artwork from the production build.
- [ ] Provide accurate reviewer steps and explain why shared GitHub/LeetCode credentials are unavailable.
- [ ] Complete developer identity, contact, tax/payment if applicable, and two-factor authentication requirements.
- [ ] Check the current official policies immediately before submission.

## Submission and rollout

- [ ] Submit packages without claiming approval.
- [ ] Record submitted versions, artifact checksums, source commit, and dashboard status.
- [ ] Use a limited/private rollout first where the store supports it.
- [ ] Verify installation, authorization, one accepted submission, one atomic commit, and disconnect on signed builds.
- [ ] Monitor store review messages and user reports without collecting extension telemetry.
