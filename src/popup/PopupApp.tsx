import { useEffect, useState, useCallback } from 'react';
import {
  GitBranch,
  Github,
  Zap,
  ExternalLink,
  CheckCircle2,
  Clock,
  ArrowRight,
  Sparkles,
  LayoutDashboard,
  Loader2,
  Copy,
  Check,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { SyncRecordRow } from '@/components/shared/SyncRecordRow';
import { UserAvatar } from '@/components/shared/ActivityFeedItem';
import { useAppStore, useAnalytics } from '@/store/useAppStore';
import { openDashboard } from '@/lib/utils';
import { FadeIn, ScaleIn } from '@/components/shared/AnimatedContainer';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Inline Device Flow Panel ─────────────────────────────────────────────────
// Renders the user code and verification URL directly in the popup body so
// there's no need for a fixed-position modal (which is invisible in the
// 380 px popup window).

function InlineDeviceFlowPanel() {
  const { githubAuth, cancelGitHubAuth } = useAppStore();
  const deviceFlow = githubAuth.deviceFlow;
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!deviceFlow?.user_code) return;
    await navigator.clipboard.writeText(deviceFlow.user_code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [deviceFlow?.user_code]);

  if (!deviceFlow) {
    // Still initialising — show spinner
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <p className="text-sm font-medium">Requesting device code…</p>
        <p className="text-xs text-muted-foreground">Connecting to GitHub OAuth</p>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground mt-1"
          onClick={() => cancelGitHubAuth()}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="p-1.5 rounded-lg bg-foreground text-background">
          <Github className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold">Authorize GitHub</p>
          <p className="text-[10px] text-muted-foreground">Device Flow — copy code &amp; open link</p>
        </div>
      </div>

      {/* Step 1: user code */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Step 1 — Copy this code
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 px-3 py-2.5 rounded-lg bg-muted font-mono text-xl font-bold tracking-[0.2em] text-center select-all border border-border">
            {deviceFlow.user_code}
          </div>
          <button
            onClick={handleCopy}
            className="p-2.5 rounded-lg bg-muted hover:bg-muted/70 transition-colors border border-border"
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

      {/* Step 2: open URL */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Step 2 — Authorize on GitHub
        </p>
        <p className="text-[10px] text-muted-foreground font-mono truncate">
          {deviceFlow.verification_uri_complete || deviceFlow.verification_uri || 'github.com/login/device'}
        </p>
        <p className="text-[10px] text-muted-foreground">
          A GitHub tab was opened automatically. If not,{' '}
          <button
            className="text-primary underline"
            onClick={() => {
              const url = deviceFlow.verification_uri_complete || deviceFlow.verification_uri || 'https://github.com/login/device';
              chrome.tabs.create({ url });
            }}
          >
            click here
          </button>
          .
        </p>
      </div>

      {/* Status row */}
      <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-muted/50 border border-border">
        <div className="flex items-center gap-2">
          {githubAuth.status === 'polling' && (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
              <span className="text-xs text-muted-foreground">Waiting for authorization…</span>
            </>
          )}
          {githubAuth.status === 'error' && (
            <>
              <XCircle className="h-3.5 w-3.5 text-destructive" />
              <span className="text-xs text-destructive truncate max-w-[180px]">{githubAuth.error}</span>
            </>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={() => cancelGitHubAuth()}>
          Cancel
        </Button>
      </div>
    </motion.div>
  );
}

// ─── Main Popup ───────────────────────────────────────────────────────────────

export function PopupApp() {
  const { user, syncRecords, settings, githubAuth, connectGitHub } = useAppStore();
  const analytics = useAnalytics();
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.darkMode);
    void useAppStore.getState().hydrateFromStorage();
    void useAppStore.getState().initGitHubAuth();
  }, [settings.darkMode]);

  const isConnected = githubAuth.status === 'connected';
  const isAuthInProgress =
    githubAuth.status === 'pending_device_flow' || githubAuth.status === 'polling';

  const recentSyncs = syncRecords.slice(0, 3);
  const pendingCount = syncRecords.filter((r) => r.status === 'pending').length;

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await connectGitHub();
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="w-[380px] bg-background text-foreground">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary text-primary-foreground">
              <GitBranch className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-sm font-semibold">GitHubSync AI</h1>
              <p className="text-[10px] text-muted-foreground">LeetCode → GitHub</p>
            </div>
          </div>
          <Badge variant="secondary" className="text-[10px] gap-0.5">
            <Sparkles className="h-2.5 w-2.5" />
            Pro
          </Badge>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <AnimatePresence mode="wait">
          {/* ── Not connected ── */}
          {!isConnected && !isAuthInProgress && (
            <motion.div
              key="unauthenticated"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div className="flex flex-col items-center justify-center py-6 gap-3 text-center">
                <div className="p-3 rounded-full bg-muted">
                  <Github className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Connect GitHub</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Link your account to start syncing LeetCode solutions
                  </p>
                </div>
                {githubAuth.error && (
                  <div className="w-full flex items-start gap-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs text-left">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    {githubAuth.error}
                  </div>
                )}
                <Button
                  className="w-full gap-2"
                  onClick={handleConnect}
                  disabled={connecting}
                >
                  {connecting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Connecting…
                    </>
                  ) : (
                    <>
                      <Github className="h-4 w-4" />
                      Connect with GitHub
                    </>
                  )}
                </Button>
              </div>

              <div className="px-3 py-3 rounded-lg border border-dashed border-border bg-muted/30">
                <p className="text-[10px] text-muted-foreground text-center">
                  Uses GitHub Device Flow — no password required
                </p>
              </div>
            </motion.div>
          )}

          {/* ── Auth in progress: show user code inline ── */}
          {isAuthInProgress && (
            <motion.div
              key="auth-in-progress"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <InlineDeviceFlowPanel />
            </motion.div>
          )}

          {/* ── Connected: show stats ── */}
          {isConnected && (
            <motion.div
              key="connected"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <FadeIn>
                <UserAvatar
                  name={user.name}
                  avatar={user.avatar}
                  size="md"
                  showName
                  subtitle={`@${user.githubUsername}`}
                />
              </FadeIn>

              <ScaleIn delay={0.05}>
                <div className="rounded-lg border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-medium">Sync Status</span>
                    <Badge variant="success" className="text-[10px]">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Active
                    </Badge>
                  </div>
                  <Progress value={analytics.syncRate} className="h-1.5" />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{analytics.syncRate}% success rate</span>
                    <span className="font-medium">{analytics.streak} day streak 🔥</span>
                  </div>
                </div>
              </ScaleIn>

              <FadeIn delay={0.1}>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Synced', value: analytics.totalSynced, color: 'text-success' },
                    { label: 'Pending', value: pendingCount, color: 'text-warning' },
                    { label: 'Failed', value: analytics.totalFailed, color: 'text-destructive' },
                  ].map((stat, i) => (
                    <motion.div
                      key={stat.label}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + i * 0.05 }}
                      className="rounded-lg border bg-card p-3 text-center"
                    >
                      <p className={`text-lg font-semibold ${stat.color}`}>{stat.value}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{stat.label}</p>
                    </motion.div>
                  ))}
                </div>
              </FadeIn>

              <Separator />

              <FadeIn delay={0.15}>
                <div className="space-y-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Recent Syncs
                    </span>
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="rounded-lg border divide-y divide-border overflow-hidden">
                    {recentSyncs.map((record, i) => (
                      <SyncRecordRow key={record.id} record={record} index={i} compact />
                    ))}
                  </div>
                </div>
              </FadeIn>

              <FadeIn delay={0.2}>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" className="w-full" onClick={() => openDashboard()}>
                    <Zap className="h-3.5 w-3.5" />
                    Quick Sync
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => openDashboard('/dashboard')}
                  >
                    <LayoutDashboard className="h-3.5 w-3.5" />
                    Dashboard
                  </Button>
                </div>
              </FadeIn>

              <FadeIn delay={0.25}>
                <button
                  onClick={() => openDashboard('/history')}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                >
                  View all sync history
                  <ArrowRight className="h-3 w-3" />
                </button>
              </FadeIn>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border bg-muted/30">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>v1.0.0</span>
          <button
            onClick={() => openDashboard('/settings')}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            Settings
            <ExternalLink className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
