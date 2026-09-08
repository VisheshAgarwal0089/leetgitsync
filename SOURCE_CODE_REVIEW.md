# Source-code review and reproducible build

LeetGitSync is built with Node.js 22.12 or newer and npm. The extension has no generated source files, private packages or required environment variables.

From the root of this source archive:

```sh
npm ci
npm run build:firefox
```

The unpacked Firefox Manifest V3 build is written to `.output/firefox-mv3`.

To reproduce the Firefox submission and source archives:

```sh
npm run zip:firefox
```

The active extension source is under `extension/`. `wxt.config.js` supplies the WXT build and manifest configuration. `public/` contains the extension icons. Tailwind and PostCSS process the local UI styles. The build does not download remote code, read environment variables or contact LeetGitSync services.
