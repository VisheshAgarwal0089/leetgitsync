import { parseProblemUrl } from '../leetcode/url.js';
import { defineBackground } from 'wxt/utils/define-background';
import { platform, isExtensionPage, isLeetCodeProblemPage } from '../lib/compat.js';
import { createStorage } from '../lib/storage.js';
import { createService } from '../lib/service.js';
import { safeError } from '../lib/errors.js';
import { createGitHubSolutionExecutor } from '../sync/github-writer.js';
import { validateRuntimeMessage } from '../lib/messages.js';

export default defineBackground(() => {
  const store = createStorage(platform.storage.local);
  const diagnosticsEnabled = import.meta.env.DEV;
  const service = createService({ store, alarms: platform.alarms, executeSync: createGitHubSolutionExecutor({ store }), diagnosticsEnabled });
  platform.runtime.onMessage.addListener((message, sender, respond) => {
    const fromLeetCode = ['CAPTURE_LEETCODE_SUBMISSION', 'LEETGITSYNC_DIAGNOSTIC'].includes(message?.type);
    if (fromLeetCode ? !isLeetCodeProblemPage(sender) : !isExtensionPage(sender)) return false;
    const valid = validateRuntimeMessage(message, fromLeetCode ? 'leetcode' : 'extension', { diagnosticsEnabled });
    if (!valid) { respond({ success: false, error: 'Invalid extension request.' }); return false; }
    if (valid.type === 'CAPTURE_LEETCODE_SUBMISSION') {
      const page = parseProblemUrl(sender.url ?? sender.tab?.url);
      if (page?.contestSlug && !valid.data.contest) {
        respond({ success: false, error: 'Invalid capture page context.' }); return false;
      }
    }
    service.handle(valid).then((data) => respond({ success: true, data }), (error) => respond({ success: false, error: safeError(error) }));
    return true;
  });
  platform.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'github-device-auth') void service.tick().catch(() => {});
    if (alarm.name === 'sync-queue') void service.processQueue().catch(() => {});
  });
  platform.runtime.onStartup.addListener(() => { void service.resume().catch(() => {}); });
  platform.runtime.onInstalled.addListener(() => { void service.resume().catch(() => {}); });
  globalThis.addEventListener?.('online', () => { void service.processQueue().catch(() => {}); });
  void service.resume().catch(() => {});
});
