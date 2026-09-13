import { PROBLEM_MATCHES } from '../leetcode/url.js';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { CAPTURE_EVENT } from '../leetcode/protocol.js';
import { installNetworkObserver } from '../leetcode/network-observer.js';
import { BRIDGE_EVENT, BRIDGE_READY_EVENT, DIAGNOSTIC_EVENT } from '../lib/diagnostics.js';
import { bridgeEnvelope, validBridgeNonce } from '../leetcode/bridge.js';

export default defineContentScript({
  matches: PROBLEM_MATCHES,
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    let bridge = null;
    let nonce = null;
    let sequence = 0;
    const pendingMessages = [];
    const deliver = (message) => {
      if (bridge) bridge.postMessage(bridgeEnvelope(nonce, sequence++, message));
      else pendingMessages.push(message);
    };
    const stop = installNetworkObserver(window, (candidate) => {
      deliver({ type: CAPTURE_EVENT, candidate });
    }, undefined, import.meta.env.DEV ? (diagnostic) => {
      deliver({ type: DIAGNOSTIC_EVENT, diagnostic });
    } : undefined);
    const connect = (event) => {
      if (bridge || event.source !== window || event.origin !== location.origin || event.data?.source !== 'leetgitsync-isolated-v2' || event.data?.type !== BRIDGE_EVENT || !validBridgeNonce(event.data?.nonce) || event.ports?.length !== 1) return;
      nonce = event.data.nonce;
      bridge = event.ports[0];
      bridge.start();
      bridge.postMessage(bridgeEnvelope(nonce, sequence++, { type: 'BRIDGE_ACK' }));
      if (import.meta.env.DEV) pendingMessages.push({ type: DIAGNOSTIC_EVENT, diagnostic: { stage: 'BRIDGE_CONNECTED' } });
      for (const message of pendingMessages.splice(0)) bridge.postMessage(bridgeEnvelope(nonce, sequence++, message));
      window.removeEventListener('message', connect);
    };
    window.addEventListener('message', connect);
    window.postMessage({ source: 'leetgitsync-page-v2', type: BRIDGE_READY_EVENT }, location.origin);
    window.addEventListener('pagehide', () => { stop(); bridge?.close(); }, { once: true });
  },
});
