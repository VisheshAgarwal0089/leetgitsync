import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Github, XCircle, Loader2, ExternalLink, Copy, Check, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/useAppStore';

interface DeviceFlowDialogProps {
  open: boolean;
  onClose: () => void;
}

export function DeviceFlowDialog({ open, onClose }: DeviceFlowDialogProps) {
  const { githubAuth, cancelGitHubAuth } = useAppStore();
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const deviceFlow = githubAuth.deviceFlow;

  useEffect(() => {
    if (!deviceFlow) return;
    setSecondsLeft(deviceFlow.expires_in);
    const interval = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [deviceFlow]);

  const handleCopy = useCallback(async () => {
    if (!deviceFlow?.user_code) return;
    await navigator.clipboard.writeText(deviceFlow.user_code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [deviceFlow?.user_code]);

  const handleOpenVerification = useCallback(() => {
    const url = deviceFlow?.verification_uri ?? 'https://github.com/login/device';
    console.debug('[LeetGitSync Auth] opening GitHub verification URL', { url });

    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      chrome.tabs.create({ url }).catch(() => {
        window.open(url, '_blank', 'noopener,noreferrer');
      });
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [deviceFlow?.verification_uri]);

  const handleCancel = async () => {
    await cancelGitHubAuth();
    onClose();
  };

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const expiredOrDone = secondsLeft === 0 || githubAuth.status === 'connected';

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={handleCancel}
          />

          {/* Dialog */}
          <motion.div
            key="dialog"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-0 flex items-center justify-center z-50 p-4 pointer-events-none"
          >
            <div
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6 pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 rounded-xl bg-foreground text-background">
                  <Github className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">Connect GitHub</h2>
                  <p className="text-xs text-muted-foreground">Device authorization flow</p>
                </div>
              </div>

              {/* Steps */}
              <div className="space-y-4">
                {/* Step 1: Code */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Step 1 — Copy this code
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-4 py-3 rounded-xl bg-muted font-mono text-2xl font-bold tracking-[0.25em] text-center select-all">
                      {deviceFlow?.user_code ?? '--------'}
                    </div>
                    <button
                      onClick={handleCopy}
                      className="p-3 rounded-xl bg-muted hover:bg-muted/70 transition-colors"
                      title="Copy code"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Step 2: Visit URL */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Step 2 — Authorize on GitHub
                  </p>
                  <button
                    type="button"
                    onClick={handleOpenVerification}
                    className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-border hover:bg-muted transition-colors text-sm text-left"
                  >
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono text-xs text-muted-foreground flex-1 truncate">
                      {deviceFlow?.verification_uri ?? 'github.com/login/device'}
                    </span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>

                {/* Status */}
                <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-muted/50">
                  <div className="flex items-center gap-2">
                    {githubAuth.status === 'polling' && (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                        <span className="text-sm text-muted-foreground">Waiting for authorization…</span>
                      </>
                    )}
                    {githubAuth.status === 'error' && (
                      <>
                        <XCircle className="h-4 w-4 text-destructive" />
                        <span className="text-sm text-destructive truncate max-w-[180px]">
                          {githubAuth.error}
                        </span>
                      </>
                    )}
                  </div>
                  {!expiredOrDone && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {minutes}:{String(seconds).padStart(2, '0')}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex gap-2 mt-5">
                <Button variant="outline" className="flex-1" onClick={handleCancel}>
                  Cancel
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
