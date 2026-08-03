import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { StaggerContainer, FadeIn } from '@/components/shared/AnimatedContainer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAnalytics } from '@/store/useAppStore';
import { cn, getDifficultyColor } from '@/lib/utils';

const CHART_COLORS = {
  primary: 'hsl(var(--foreground))',
  success: 'hsl(var(--success))',
  warning: 'hsl(var(--warning))',
  destructive: 'hsl(var(--destructive))',
  muted: 'hsl(var(--muted-foreground))',
};

const PIE_COLORS = ['#22c55e', '#eab308', '#ef4444', '#6366f1', '#8b5cf6', '#06b6d4', '#f97316'];

const languageLabels: Record<string, string> = {
  python: 'Python',
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  java: 'Java',
  cpp: 'C++',
  go: 'Go',
  rust: 'Rust',
};

export function AnalyticsPage() {
  const analytics = useAnalytics();

  const stats = [
    { label: 'Total Synced', value: analytics.totalSynced, change: 12.5, trend: 'up' as const, icon: 'GitBranch' },
    { label: 'Success Rate', value: `${analytics.syncRate}%`, change: 2.1, trend: 'up' as const, icon: 'CheckCircle' },
    { label: 'Active Streak', value: `${analytics.streak} days`, change: 0, trend: 'neutral' as const, icon: 'Flame' },
    { label: 'Failed Syncs', value: analytics.totalFailed, change: -15, trend: 'down' as const, icon: 'FolderGit2' },
  ];

  return (
    <div className="space-y-8">
      <FadeIn>
        <PageHeader
          title="Analytics"
          description="Track your sync performance and coding patterns"
        />
      </FadeIn>

      <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </StaggerContainer>

      <Tabs defaultValue="activity" className="space-y-6">
        <TabsList>
          <TabsTrigger value="activity">Weekly Activity</TabsTrigger>
          <TabsTrigger value="trend">Monthly Trend</TabsTrigger>
          <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
        </TabsList>

        <TabsContent value="activity">
          <FadeIn>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Weekly Sync Activity</CardTitle>
                <CardDescription>Synced vs failed syncs over the past week</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.weeklyActivity} barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis
                        dataKey="day"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="synced" fill={CHART_COLORS.success} radius={[4, 4, 0, 0]} name="Synced" />
                      <Bar dataKey="failed" fill={CHART_COLORS.destructive} radius={[4, 4, 0, 0]} name="Failed" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </FadeIn>
        </TabsContent>

        <TabsContent value="trend">
          <FadeIn>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Monthly Sync Trend</CardTitle>
                <CardDescription>Total solutions synced per month</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analytics.monthlyTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis
                        dataKey="month"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="synced"
                        stroke={CHART_COLORS.primary}
                        strokeWidth={2}
                        dot={{ fill: CHART_COLORS.primary, strokeWidth: 0, r: 4 }}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                        name="Synced"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </FadeIn>
        </TabsContent>

        <TabsContent value="breakdown">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <FadeIn delay={0.1}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Difficulty Breakdown</CardTitle>
                  <CardDescription>Distribution of synced problems by difficulty</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={analytics.difficultyBreakdown}
                          dataKey="count"
                          nameKey="difficulty"
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={3}
                        >
                          {analytics.difficultyBreakdown.map((entry: any) => (
                            <Cell
                              key={entry.difficulty}
                              fill={
                                entry.difficulty === 'Easy'
                                  ? CHART_COLORS.success
                                  : entry.difficulty === 'Medium'
                                    ? CHART_COLORS.warning
                                    : CHART_COLORS.destructive
                              }
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--popover))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            fontSize: '12px',
                          }}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    {analytics.difficultyBreakdown.map((item: any) => (
                      <div key={item.difficulty} className="text-center">
                        <p className={cn('text-lg font-semibold', getDifficultyColor(item.difficulty).split(' ')[0])}>
                          {item.percentage}%
                        </p>
                        <p className="text-xs text-muted-foreground">{item.difficulty}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </FadeIn>

            <FadeIn delay={0.15}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Language Distribution</CardTitle>
                  <CardDescription>Programming languages used in synced solutions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {analytics.languageBreakdown.map((item: any, index: number) => (
                      <div key={item.language} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{languageLabels[item.language]}</span>
                          <span className="text-muted-foreground">
                            {item.count} ({item.percentage}%)
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-secondary overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700 ease-out"
                            style={{
                              width: `${item.percentage}%`,
                              backgroundColor: PIE_COLORS[index % PIE_COLORS.length],
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </FadeIn>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
