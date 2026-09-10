# Official release requirements reviewed

Reviewed September 9, 2026. Store dashboards and policies can change; verify them again immediately before submission.

## Chrome Web Store

- Manifest listing fields must be accurate and the package ZIP must contain `manifest.json` at its root.
- The extension needs a narrow single purpose, minimum permissions, a public privacy policy for handled user data, consistent privacy-form disclosures, and no remotely hosted executable code.
- The listing requires store artwork and screenshots in the current dashboard sizes. Developer accounts must meet current identity and two-factor authentication requirements.

Official sources: [Prepare your extension](https://developer.chrome.com/docs/webstore/prepare), [Program policies](https://developer.chrome.com/docs/webstore/program-policies/policies), [User data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), and [Image requirements](https://developer.chrome.com/docs/webstore/images).

## Microsoft Edge Add-ons

- Upload a ZIP package with accurate listing information, visual assets, permission explanations, data-use declarations, privacy-policy URL, and useful certification notes.
- Use minimum permissions and provide a testable experience. For account-dependent behavior, explain why shared test credentials cannot be provided and give reviewer-controlled setup steps.

Official sources: [Publish a Microsoft Edge extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension), [Hosting and updating](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/hosting-and-updating), and [Developer policies](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies).

## Firefox Add-ons

- Manifest V3 packages require a Gecko extension ID. Firefox 140 and newer require `browser_specific_settings.gecko.data_collection_permissions` for new submissions.
- Bundled or minified extensions must provide source code and reproducible build instructions for review. Listings need accurate summary/category metadata and must follow Mozilla's user-data and consent policies.

Official sources: [Built-in data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/), [Add-on policies](https://extensionworkshop.com/documentation/publish/add-on-policies/), [Source-code submission](https://extensionworkshop.com/documentation/publish/source-code-submission/), and [web-ext guidance](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/).

## Brave

Brave supports nearly all Chromium-compatible extensions and directs users to the Chrome Web Store. The Brave build is useful for direct private-beta testing; public distribution normally uses the Chrome listing.

Official source: [Brave extension installation](https://support.brave.com/hc/en-us/articles/360017909112-How-can-I-add-extensions-to-Brave).

## GitHub Device Flow

Device Flow does not require a client secret, so only the public OAuth client ID belongs in an extension. Tokens must be protected as well as the client platform permits, scopes must be minimized, and users need revocation/disconnect controls. LeetGitSync requests `repo` because it advertises private-repository support; `public_repo` would cover public repositories only.

Official sources: [OAuth app best practices](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/best-practices-for-creating-an-oauth-app) and [OAuth scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps).
