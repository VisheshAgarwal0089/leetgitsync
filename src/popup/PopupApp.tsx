import { useEffect } from 'react';
import {
  GitBranch,
  Zap,
  ExternalLink,
  CheckCircle2,
  Clock,
  ArrowRight,
  Sparkles,
  LayoutDashboard,
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
import { motion } from 'framer-motion';

export function PopupApp() {
  const { user, syncRecords, settings } = useAppStore();
  const analytics = useAnalytics();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.darkMode);
    void useAppStore.getState().hydrateFromStorage();
    void useAppStore.getState().initGitHubAuth();
  }, [settings.darkMode]);

  const recentSyncs = syncRecords.slice(0, 3);
  const pendingCount = syncRecords.filter((r) => r.status === 'pending').length;

  return (
    <div className="w-[380px] bg-background text-foreground">
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
      </div>

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
