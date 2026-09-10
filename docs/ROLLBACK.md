# Rollback procedure

Browser stores generally require version numbers to increase, so a public rollback is a fix-forward release built from the last known-good source.

1. Pause or stop the affected store rollout where its dashboard permits.
2. Record the affected version, browser, symptoms, and package checksum. Do not request tokens, source code, cookies, or private API responses from users.
3. Reproduce with mocked APIs or a developer-owned test repository. Never use a user's repository for automated verification.
4. Check out the last known-good source in an isolated worktree and apply the minimum corrective change.
5. Preserve the storage schema and migration path. Never delete tokens, pending jobs, failures, or history as a rollback shortcut.
6. Increase the extension version, run `npm run release:verify`, and repeat signed-package smoke tests.
7. Submit the replacement to each affected store with accurate reviewer notes. Do not claim rollback completion before store approval and rollout.
8. If credentials could be exposed, revoke the GitHub OAuth application credentials or affected grants and instruct users to reconnect after the fixed release.

For private beta, stop distributing the affected archive and provide a higher-version fixed package. Reloading an older unpacked folder is acceptable only for developer diagnosis because browsers and stores may reject version downgrades.
