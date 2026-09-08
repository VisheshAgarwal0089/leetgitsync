import { defineContentScript } from 'wxt/utils/define-content-script';
import { CAPTURE_EVENT } from '../leetcode/protocol.js';
import { installNetworkObserver } from '../leetcode/network-observer.js';
import { BRIDGE_EVENT, BRIDGE_READY_EVENT, DIAGNOSTIC_EVENT } from '../lib/diagnostics.js';

export default defineContentScript({
  matches: ['https://leetcode.com/problems/*'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    let bridge = null;
    const pendingMessages = [];
    const deliver = (message) => {
      if (bridge) bridge.postMessage(message);
      else pendingMessages.push(message);
    };
    const stop = installNetworkObserver(window, (candidate) => {
      deliver({ type: CAPTURE_EVENT, candidate });
    }, undefined, (diagnostic) => {
      deliver({ type: DIAGNOSTIC_EVENT, diagnostic });
    });
    const connect = (event) => {
      if (bridge || event.source !== window || event.origin !== location.origin || event.data?.source !== 'leetgitsync-isolated-v1' || event.data?.type !== BRIDGE_EVENT || event.ports?.length !== 1) return;
      bridge = event.ports[0];
      bridge.start();
      pendingMessages.push({ type: DIAGNOSTIC_EVENT, diagnostic: { stage: 'BRIDGE_CONNECTED' } });
      for (const message of pendingMessages.splice(0)) bridge.postMessage(message);
      window.removeEventListener('message', connect);
    };
    window.addEventListener('message', connect);
    window.postMessage({ source: 'leetgitsync-page-v1', type: BRIDGE_READY_EVENT }, location.origin);
    window.addEventListener('pagehide', () => { stop(); bridge?.close(); }, { once: true });
  },
});
