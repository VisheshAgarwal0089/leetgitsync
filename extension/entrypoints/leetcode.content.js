import { defineContentScript } from 'wxt/utils/define-content-script';
import { platform } from '../lib/compat.js';
import { CAPTURE_EVENT, getProblemSlug } from '../leetcode/protocol.js';
import { createMetadataProvider } from '../leetcode/metadata.js';
import { createCapturePipeline } from '../leetcode/pipeline.js';
import { observeNavigation } from '../leetcode/navigation.js';
import { installSubmissionFallback } from '../leetcode/submission-fallback.js';
import { BRIDGE_EVENT, BRIDGE_READY_EVENT, DIAGNOSTIC_EVENT, DIAGNOSTIC_MESSAGE } from '../lib/diagnostics.js';
import { createBridgeNonce, validateBridgeEnvelope } from '../leetcode/bridge.js';

export default defineContentScript({
  matches: ['https://leetcode.com/problems/*'],
  runAt: 'document_start',
  main() {
    const diagnosticsEnabled = import.meta.env.DEV;
    const diagnose = diagnosticsEnabled ? (data) => platform.runtime.sendMessage({ type: DIAGNOSTIC_MESSAGE, data }).catch(() => {}) : () => Promise.resolve();
    void diagnose({ stage: 'CONTENT_SCRIPT_LOADED', slug: getProblemSlug(location.href) });
    const metadata = createMetadataProvider({ document });
    const pipeline = createCapturePipeline({
      metadata,
      send: (record) => platform.runtime.sendMessage({ type: 'CAPTURE_LEETCODE_SUBMISSION', data: record }).then((response) => {
        if (!response?.success) throw new Error('The extension could not save this accepted submission.');
        return response.data;
      }),
      diagnose,
      report: (message) => console.warn(message),
    });
    let connected = false;
    const nonce = createBridgeNonce();
    let expectedSequence = 0;
    const onBridgeMessage = (event) => {
      const payload = validateBridgeEnvelope(event.data, nonce, expectedSequence, { diagnosticsEnabled });
      if (!payload) return;
      if (!connected) {
        if (payload.type !== 'BRIDGE_ACK') return;
        connected = true;
        window.removeEventListener('message', onReady);
      }
      expectedSequence += 1;
      if (payload.type === CAPTURE_EVENT) void pipeline.capture(payload.candidate).catch(() => {});
      if (payload.type === DIAGNOSTIC_EVENT) void diagnose(payload.diagnostic);
    };
    const connect = () => {
      if (connected) return;
      const channel = new MessageChannel();
      channel.port1.addEventListener('message', onBridgeMessage);
      channel.port1.start();
      window.postMessage({ source: 'leetgitsync-isolated-v2', type: BRIDGE_EVENT, nonce }, location.origin, [channel.port2]);
    };
    function onReady(event) {
      if (event.source === window && event.origin === location.origin && event.data?.source === 'leetgitsync-page-v2' && event.data?.type === BRIDGE_READY_EVENT) connect();
    }
    window.addEventListener('message', onReady);
    connect();
    const fallback = installSubmissionFallback({ window, capture: pipeline.capture, diagnose });
    observeNavigation({ window, document, onNavigate: () => pipeline.navigation() });
    window.addEventListener('pagehide', () => fallback.stop(), { once: true });
  },
});
