import { useState, useEffect } from 'react';
import type { GitHubAuthState } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Github,
  XCircle,
  Loader2,
  LogOut,
  RefreshCw,
  ExternalLink,
  GitBranch,
  Star,
  Lock,
  Globe,
  Plus,
  AlertCircle,
  Wifi,
  WifiOff,
  ChevronDown,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAppStore } from '@/store/useAppStore';
import { DeviceFlowDialog } from './DeviceFlowDialog';
import { CreateRepoDialog } from './CreateRepoDialog';
import { cn } from '@/lib/utils';

// ─── Connection Status Badge ──────────────────────────────────────────────────

function ConnectionStatusBadge() {
  const { githubAuth } = useAppStore();
  const status = githubAuth.status;

  const config = {
    idle: { label: 'Not Connected', icon: WifiOff, cls: 'bg-muted text-muted-foreground' },
    pending_device_flow: { label: 'Initializing…', icon: Loader2, cls: 'bg-blue-500/10 text-blue-500' },
    polling: { label: 'Awaiting Authorization', icon: Loader2, cls: 'bg-amber-500/10 text-amber-500' },
    connected: { label: 'Connected', icon: Wifi, cls: 'bg-green-500/10 text-green-500' },
    error: { label: 'Connection Error', icon: XCircle, cls: 'bg-destructive/10 text-destructive' },
  }[status];

  const Icon = config.icon;
  const spinning = status === 'pending_device_flow' || status === 'polling';

  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full', config.cls)}>
      <Icon className={cn('h-3 w-3', spinning && 'animate-spin')} />
      {config.label}
    </span>
  );
}

// ─── Connected User Panel ─────────────────────────────────────────────────────

function ConnectedUserPanel() {
  const { githubAuth, disconnectGitHub } = useAppStore();
  const user = githubAuth.user;
  const [disconnecting, setDisconnecting] = useState(false);

  if (!user) return null;

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectGitHub();
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/60"
    >
      <div className="flex items-center gap-3">
        <Avatar className="h-9 w-9">
          <AvatarImage src={user.avatar_url} alt={user.login} />
          <AvatarFallback>{user.login.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{user.name ?? user.login}</p>
          <a
            href={user.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            @{user.login}
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground hidden sm:block">
          {user.public_repos} repos
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDisconnect}
          disabled={disconnecting}
          className="h-8 gap-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        >
          {disconnecting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <LogOut className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">Disconnect</span>
        </Button>
      </div>
    </motion.div>
  );
}

// ─── Repository Selector ──────────────────────────────────────────────────────

interface RepoSelectorProps {
  selectedRepo: string;
  onSelect: (fullName: string) => void;
  onCreateNew: () => void;
}

function RepoSelector({ selectedRepo, onSelect, onCreateNew }: RepoSelectorProps) {
  const { githubRepos, reposLoading, reposError, loadRepositories } = useAppStore();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = githubRepos.filter(
    (r) =>
      r.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (r.description ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const selected = githubRepos.find((r) => r.full_name === selectedRepo);

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-sm transition-all',
          'hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring',
          open && 'ring-2 ring-ring bg-muted'
        )}
      >
        {reposLoading ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading repositories…
          </span>
        ) : selected ? (
          <span className="flex items-center gap-2 truncate">
            {selected.private ? (
              <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            ) : (
              <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            <span className="font-mono truncate">{selected.full_name}</span>
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground shrink-0">
              <Star className="h-3 w-3" />
              {selected.stargazers_count}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">Select repository…</span>
        )}
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full mt-1 w-full z-30 bg-card border border-border rounded-xl shadow-xl overflow-hidden"
          >
            {/* Search */}
            <div className="p-2 border-b border-border">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted">
                <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search repositories…"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>

            {/* Error state */}
            {reposError && (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-3.5 w-3.5" />
                {reposError}
                <button
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground underline"
                  onClick={() => { loadRepositories(); }}
                >
                  Retry
                </button>
              </div>
            )}

            {/* Repo list */}
            <div className="max-h-52 overflow-y-auto">
              {filtered.length === 0 && !reposLoading && (
                <p className="text-sm text-muted-foreground text-center py-4">No repositories found</p>
              )}
              {filtered.map((repo) => (
                <button
                  key={repo.id}
                  type="button"
                  onClick={() => { onSelect(repo.full_name); setOpen(false); setSearch(''); }}
                  className={cn(
                    'w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted transition-colors',
                    selectedRepo === repo.full_name && 'bg-primary/5'
                  )}
                >
                  {repo.private ? (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  ) : (
                    <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-mono truncate">{repo.full_name}</p>
                    {repo.description && (
                      <p className="text-xs text-muted-foreground truncate">{repo.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <Star className="h-3 w-3" />
                    {repo.stargazers_count}
                  </div>
                </button>
              ))}
            </div>

            {/* Create new */}
            <div className="border-t border-border p-2">
              <button
                type="button"
                onClick={() => { setOpen(false); onCreateNew(); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-primary hover:bg-primary/10 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Create new repository
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Branch Selector ──────────────────────────────────────────────────────────

interface BranchSelectorProps {
  selectedBranch: string;
  onSelect: (branch: string) => void;
}

function BranchSelector({ selectedBranch, onSelect }: BranchSelectorProps) {
  const { githubBranches, branchesLoading, branchesError } = useAppStore();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = githubBranches.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase())
  );

  if (!githubBranches.length && !branchesLoading) {
    return (
      <div className="px-3 py-2.5 rounded-xl border border-dashed border-border text-sm text-muted-foreground text-center">
        Select a repository first
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-sm transition-all',
          'hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring',
          open && 'ring-2 ring-ring bg-muted'
        )}
      >
        {branchesLoading ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading branches…
          </span>
        ) : selectedBranch ? (
          <span className="flex items-center gap-2">
            <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-mono">{selectedBranch}</span>
          </span>
        ) : (
          <span className="text-muted-foreground flex items-center gap-2">
            <GitBranch className="h-3.5 w-3.5" />
            Select branch…
          </span>
        )}
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full mt-1 w-full z-30 bg-card border border-border rounded-xl shadow-xl overflow-hidden"
          >
            <div className="p-2 border-b border-border">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted">
                <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter branches…"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>

            {branchesError && (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-3.5 w-3.5" />
                {branchesError}
              </div>
            )}

            <div className="max-h-44 overflow-y-auto">
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No branches found</p>
              )}
              {filtered.map((branch) => (
                <button
                  key={branch.name}
                  type="button"
                  onClick={() => { onSelect(branch.name); setOpen(false); setSearch(''); }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-muted transition-colors text-sm',
                    selectedBranch === branch.name && 'bg-primary/5'
                  )}
                >
                  <GitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-mono flex-1">{branch.name}</span>
                  {branch.protected && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      protected
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main GitHub Connect Card ─────────────────────────────────────────────────

export function GitHubConnectCard() {
  const {
    githubAuth,
    settings,
    setSettings,
    connectGitHub,
    loadRepositories,
    loadBranches,
    setGitHubAuthSuccess,
    setGitHubAuthError,
  } = useAppStore();

  const [showDeviceFlow, setShowDeviceFlow] = useState(false);
  const [showCreateRepo, setShowCreateRepo] = useState(false);

  const isConnected = githubAuth.status === 'connected';
  const isConnecting = githubAuth.status === 'pending_device_flow' || githubAuth.status === 'polling';

  // Listen for background auth completion
  useEffect(() => {
    const listener = (message: { type: string; user?: GitHubAuthState['user']; token?: string; error?: string }) => {
      if (message.type === 'GITHUB_AUTH_SUCCESS' && message.user && message.token) {
        setGitHubAuthSuccess(message.user, message.token);
        setShowDeviceFlow(false);
      } else if (message.type === 'GITHUB_AUTH_ERROR') {
        setGitHubAuthError(message.error ?? 'Unknown error');
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [setGitHubAuthSuccess, setGitHubAuthError]);

  // Auto-close device flow dialog when connected
  useEffect(() => {
    if (isConnected && showDeviceFlow) {
      setShowDeviceFlow(false);
    }
  }, [isConnected, showDeviceFlow]);

  // Load repos when first connected
  useEffect(() => {
    if (isConnected) {
      loadRepositories();
    }
  }, [isConnected]);

  const handleConnect = async () => {
    console.debug('[LeetGitSync Auth] connect button clicked in GitHub connect card');
    try {
      await connectGitHub();
      setShowDeviceFlow(true);
    } catch (error) {
      console.error('[LeetGitSync Auth] connect button handler failed', error);
    }
  };

  const handleRepoSelect = (fullName: string) => {
    setSettings({ defaultRepository: fullName, defaultBranch: '' });
    const [owner, repo] = fullName.split('/');
    loadBranches(owner, repo);
  };

  const handleBranchSelect = (branch: string) => {
    setSettings({ defaultBranch: branch });
  };

  return (
    <>
      <div className="space-y-5">
        {/* Header row */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <div className={cn(
              'p-2 rounded-xl transition-colors',
              isConnected ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'
            )}>
              <Github className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium">GitHub Account</p>
              <p className="text-xs text-muted-foreground">OAuth via Device Flow</p>
            </div>
          </div>
          <ConnectionStatusBadge />
        </div>

        {/* Connected user or connect button */}
        <AnimatePresence mode="wait">
          {isConnected ? (
            <motion.div
              key="connected"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <ConnectedUserPanel />
            </motion.div>
          ) : (
            <motion.div
              key="disconnected"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              {githubAuth.error && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-destructive/10 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  {githubAuth.error}
                </div>
              )}
              <Button
                onClick={handleConnect}
                disabled={isConnecting}
                className="w-full gap-2"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Connecting…
                  </>
                ) : (
                  <>
                    <Github className="h-4 w-4" />
                    Connect GitHub
                  </>
                )}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Repository & Branch — only when connected */}
        <AnimatePresence>
          {isConnected && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4 overflow-hidden"
            >
              <Separator />

              {/* Repository */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Repository</label>
                  <button
                    type="button"
                    onClick={() => loadRepositories()}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Refresh
                  </button>
                </div>
                <RepoSelector
                  selectedRepo={settings.defaultRepository}
                  onSelect={handleRepoSelect}
                  onCreateNew={() => setShowCreateRepo(true)}
                />
              </div>

              {/* Branch */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Branch</label>
                <BranchSelector
                  selectedBranch={settings.defaultBranch}
                  onSelect={handleBranchSelect}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Dialogs */}
      <DeviceFlowDialog
        open={showDeviceFlow}
        onClose={() => setShowDeviceFlow(false)}
      />
      <CreateRepoDialog
        open={showCreateRepo}
        onClose={() => setShowCreateRepo(false)}
        onCreated={(repo) => handleRepoSelect(repo.full_name)}
      />
    </>
  );
}


