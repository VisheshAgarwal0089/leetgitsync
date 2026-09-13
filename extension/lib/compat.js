import { parseProblemUrl } from '../leetcode/url.js';
import { browser } from 'wxt/browser';
import { validateUiResponse } from './messages.js';

// WXT normalizes Promise-based WebExtension APIs across Chromium and Firefox.
export const platform = browser;
export async function request(type, data) {
  const response = await browser.runtime.sendMessage({ type, data });
  if (!validateUiResponse(response)) throw new Error('Extension returned an invalid response. Reload the extension and try again.');
  if (!response.success) throw new Error(response.error || 'Extension unavailable. Reload the extension and try again.');
  return response.data;
}
export function isExtensionPage(sender) {
  return sender.id === browser.runtime.id &&
    [browser.runtime.getURL('/popup.html'), browser.runtime.getURL('/options.html')]
      .some((url) => sender.url?.split(/[?#]/)[0] === url);
}
export function isLeetCodeProblemPage(sender) {
  if (sender.id !== browser.runtime.id || !sender.tab) return false;
  try {
    const url = new URL(sender.url ?? sender.tab?.url ?? sender.origin);
    return Boolean(parseProblemUrl(url.href));
  } catch { return false; }
}
