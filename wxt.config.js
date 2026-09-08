import { defineConfig } from 'wxt';
import react from '@vitejs/plugin-react';

export default defineConfig({
  srcDir: 'extension',
  manifestVersion: 3,
  zip: {
    includeSources: [
      'extension/**', 'public/**', 'wxt.config.js', 'package.json', 'package-lock.json',
      'tailwind.config.js', 'postcss.config.cjs', 'eslint.config.js', 'README.md', 'PRIVACY.md',
    ],
  },
  vite: () => ({ plugins: [react()] }),
  manifest: ({ browser }) => ({
    name: 'LeetGitSync',
    description: 'Connect GitHub and configure your LeetCode solutions repository.',
    homepage_url: 'https://github.com/VisheshAgarwal0089/leetgitsync',
    permissions: ['storage', 'alarms'],
    host_permissions: ['https://github.com/*', 'https://api.github.com/*'],
    icons: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
    action: { default_title: 'LeetGitSync' },
    content_security_policy: { extension_pages: "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; connect-src https://github.com https://api.github.com" },
    ...(browser === 'firefox' ? { browser_specific_settings: {
      gecko: { id: 'leetgitsync@extensions.local', strict_min_version: '140.0', data_collection_permissions: { required: ['authenticationInfo', 'websiteContent'] } },
    } } : { minimum_chrome_version: '120' }),
  }),
});
