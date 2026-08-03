import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useEffect, useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Github, Loader2, Sparkles } from 'lucide-react';

export function DashboardLayout() {
  const settings = useAppStore((s) => s.settings);
  const githubAuth = useAppStore((s) => s.githubAuth);
  const leetcodeAuth = useAppStore((s) => s.leetcodeAuth);
  const onboarding = useAppStore((s) => s.onboarding);
  const connectGitHub = useAppStore((s) => s.connectGitHub);
  const connectLeetCode = useAppStore((s) => s.connectLeetCode);
  const importHistoricalSubmissions = useAppStore((s) => s.importHistoricalSubmissions);
  const ensureOnboarding = useAppStore((s) => s.ensureOnboarding);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.darkMode);
    void ensureOnboarding();
    void useAppStore.getState().hydrateFromStorage();
    void useAppStore.getState().initGitHubAuth();
  }, [settings.darkMode, githubAuth.token, leetcodeAuth.profile, onboarding.historyImported, ensureOnboarding]);

  const isReady = useMemo(() => {
    const githubConnected = Boolean(githubAuth.token);
    const leetcodeConnected = Boolean(leetcodeAuth.profile?.connected);
    return githubConnected && leetcodeConnected && onboarding.historyImported;
  }, [githubAuth.token, leetcodeAuth.profile?.connected, onboarding.historyImported]);

  if (!isReady && (!githubAuth.token || !leetcodeAuth.profile?.connected)) {
    return (
      <TooltipProvider>
        <div className="flex h-screen bg-background overflow-hidden">
          <Sidebar />
          <div className="flex flex-col flex-1 min-w-0">
            <Header />
            <main className="flex-1 overflow-auto">
              <div className="p-6 max-w-7xl mx-auto">
                <Card className="w-full max-w-2xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5" />
                      Welcome to GitHubSync AI
                    </CardTitle>
                    <CardDescription>
                      Connect GitHub and LeetCode, import your history, and then live sync will begin.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      {[
                        { label: 'Connect GitHub', done: Boolean(githubAuth.token), loading: githubAuth.status === 'pending_device_flow' || githubAuth.status === 'polling' },
                        { label: 'Connect LeetCode', done: Boolean(leetcodeAuth.profile?.connected), loading: leetcodeAuth.status === 'pending' },
                        { label: 'Import accepted history', done: onboarding.historyImported, loading: onboarding.isImportingHistory },
                      ].map((step) => (
                        <div key={step.label} className="flex items-center justify-between rounded-lg border p-3">
                          <span className="text-sm">{step.label}</span>
                          {step.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : step.done ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Button onClick={() => void connectGitHub()} disabled={Boolean(githubAuth.token)}>
                        <Github className="mr-2 h-4 w-4" />
                        {githubAuth.token ? 'GitHub Connected' : 'Connect GitHub'}
                      </Button>
                      <Button variant="outline" onClick={() => void connectLeetCode()} disabled={Boolean(leetcodeAuth.profile?.connected)}>
                        {leetcodeAuth.status === 'pending' ? 'Connecting...' : 'Connect LeetCode'}
                      </Button>
                      <Button variant="secondary" onClick={() => void importHistoricalSubmissions()} disabled={onboarding.isImportingHistory || onboarding.historyImported}>
                        {onboarding.isImportingHistory ? 'Importing...' : 'Import History'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </main>
          </div>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-background overflow-hidden">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <Header />
          <main className="flex-1 overflow-auto">
            <div className="p-6 max-w-7xl mx-auto">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
