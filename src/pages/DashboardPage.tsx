import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { StaggerContainer } from '@/components/shared/AnimatedContainer';
import { SyncRecordRow } from '@/components/shared/SyncRecordRow';
import { ActivityFeedItem } from '@/components/shared/ActivityFeedItem';
import { RepositoryCard } from '@/components/shared/RepositoryCard';
import { ProblemTag } from '@/components/shared/ProblemTag';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  useAppStore,
  useDashboardStats,
  useRepositories,
  useActivity,
  useProblems,
  useAnalytics,
} from '@/store/useAppStore';
import { FadeIn } from '@/components/shared/AnimatedContainer';
import { ArrowRight, Zap, RefreshCw } from 'lucide-react';

export function DashboardPage() {
  const syncRecords = useAppStore((s) => s.syncRecords);
  const stats = useDashboardStats();
  const repositories = useRepositories();
  const activity = useActivity();
  const problems = useProblems();
  const analytics = useAnalytics();

  const recentSyncs = syncRecords.slice(0, 5);
  const recentActivity = activity.slice(0, 5);
  const recentProblems = problems.slice(0, 4);

  return (
    <div className="space-y-8">
      <FadeIn>
        <PageHeader
          title="Dashboard"
          description="Overview of your LeetCode to GitHub sync activity"
          actions={
            <>
              <Button variant="outline" size="sm">
                <RefreshCw className="h-4 w-4" />
                Sync Now
              </Button>
              <Button size="sm">
                <Zap className="h-4 w-4" />
                Quick Sync
              </Button>
            </>
          }
        />
      </FadeIn>

      <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </StaggerContainer>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <FadeIn delay={0.1} className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <CardTitle className="text-base font-medium">Recent Syncs</CardTitle>
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                View all
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              <div className="divide-y divide-border">
                {recentSyncs.map((record, i) => (
                  <SyncRecordRow key={record.id} record={record} index={i} />
                ))}
              </div>
            </CardContent>
          </Card>
        </FadeIn>

        <FadeIn delay={0.15}>
          <Card className="h-full">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-medium">Sync Health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Success Rate</span>
                  <span className="font-medium">{analytics.syncRate}%</span>
                </div>
                <Progress value={analytics.syncRate} className="h-2" />
              </div>

              <Separator />

              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-semibold text-success">{analytics.totalSynced}</p>
                  <p className="text-xs text-muted-foreground mt-1">Synced</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-warning">{analytics.totalPending}</p>
                  <p className="text-xs text-muted-foreground mt-1">Pending</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-destructive">{analytics.totalFailed}</p>
                  <p className="text-xs text-muted-foreground mt-1">Failed</p>
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🔥</span>
                  <div>
                    <p className="text-sm font-medium">{analytics.streak} day streak</p>
                    <p className="text-xs text-muted-foreground">Keep it going!</p>
                  </div>
                </div>
                <Badge variant="success">Active</Badge>
              </div>
            </CardContent>
          </Card>
        </FadeIn>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FadeIn delay={0.2}>
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-medium">Repositories</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {repositories.map((repo, i) => (
                <RepositoryCard key={repo.id} repository={repo} index={i} />
              ))}
            </CardContent>
          </Card>
        </FadeIn>

        <FadeIn delay={0.25}>
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-medium">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border">
                {recentActivity.map((item, i) => (
                  <ActivityFeedItem key={item.id} item={item} index={i} />
                ))}
              </div>
            </CardContent>
          </Card>
        </FadeIn>
      </div>

      <FadeIn delay={0.3}>
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-medium">Recently Solved</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {recentProblems.map((problem, i) => (
              <ProblemTag key={problem.id} problem={problem} index={i} />
            ))}
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  );
}
