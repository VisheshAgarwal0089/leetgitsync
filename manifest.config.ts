import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'GitHubSync AI',
  version: '1.0.0',
  description: 'Sync your LeetCode solutions to GitHub with AI-powered intelligence',
  icons: {
    '16': 'icons/icon-16.png',
    '32': 'icons/icon-32.png',
    '48': 'icons/icon-48.png',
    '128': 'icons/icon-128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'GitHubSync AI',
    default_icon: {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
    },
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  permissions: ['storage', 'tabs', 'identity', 'notifications'],
  host_permissions: [
    'https://github.com/*',
    'https://api.github.com/*',
    'https://leetcode.com/*',
    'https://*.leetcode.com/*',
  ],
  options_ui: {
    page: 'src/dashboard/index.html',
    open_in_tab: true,
  },
  content_scripts: [
    {
      matches: ['*://leetcode.com/problems/*'],
      js: ['src/content/index.ts'],
    },
  ],
  web_accessible_resources: [
    {
      resources: ['src/content/inject.js'],
      matches: ['*://leetcode.com/*'],
    },
  ],
});
