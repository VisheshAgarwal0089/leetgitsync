import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

const AUTH_DEBUG_PREFIX = '[LeetGitSync Auth]';

let backgroundListenersRegistered = false;
let githubAuthPollingTimer: number | null = null;

function stopGitHubAuthPolling() {
  if (githubAuthPollingTimer !== null) {
    clearInterval(githubAuthPollingTimer);
    githubAuthPollingTimer = null;
  }
}

function registerBackgroundListeners() {
  if (backgroundListenersRegistered || typeof chrome === 'undefined' || !chrome.runtime?.onMessage) {
    return;
  }

  backgroundListenersRegistered = true;

  chrome.runtime.onMessage.addListener((message: { type?: string; user?: GitHubAuthState['user']; token?: string; error?: string }) => {
    if (message?.type === 'GITHUB_AUTH_SUCCESS' && message.user && message.token) {
      useAppStore.getState().setGitHubAuthSuccess(message.user, message.token);
    } else if (message?.type === 'GITHUB_AUTH_ERROR') {
      useAppStore.getState().setGitHubAuthError(message.error ?? 'Unknown error');
    }
  });
}

const chromeStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return new Promise((resolve) => {
      chrome.storage.local.get(name, (result) => {
        resolve(result[name] || null);
      });
    });
  },
  setItem: async (name: string, value: string): Promise<void> => {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [name]: value }, () => {
        resolve();
      });
    });
  },
  removeItem: async (name: string): Promise<void> => {
    return new Promise((resolve) => {
      chrome.storage.local.remove(name, () => {
        resolve();
      });
    });
  },
};
import type {
  Settings,
  SyncRecord,
  User,
  GitHubAuthState,
  GitHubRepo,
  GitHubBranch,
  LeetCodeAuthState,
  OnboardingState,
  Problem,
} from '@/types';
import { getGitHubAuth, saveGitHubAuth, clearGitHubAuth } from '@/lib/storage';

// ─── Message helpers ─────────────────────────────────────────────────────────

function sendBg<T>(message: object): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response) {
        reject(new Error('No response from background'));
        return;
      }
      if (response.success) {
        resolve(response.data as T);
      } else {
        reject(new Error(response.error || 'Unknown error'));
      }
    });
  });
}

// ─── Initial GitHub auth state ────────────────────────────────────────────────

const initialGitHubAuth: GitHubAuthState = {
  status: 'idle',
  token: null,
  user: null,
  error: null,
  deviceFlow: null,
};

const initialLeetCodeAuth: LeetCodeAuthState = {
  status: 'idle',
  profile: null,
  error: null,
};

const initialOnboardingState: OnboardingState = {
  isComplete: false,
  isImportingHistory: false,
  historyImported: false,
  importProgress: 0,
  completedSteps: [],
  lastError: null,
  lastImportedAt: null,
};

const emptyUser: User = {
  id: '',
  name: '',
  email: null,
  avatar: '',
  leetcodeUsername: '',
  githubUsername: '',
  plan: 'free',
};

const emptySettings: Settings = {
  autoSync: true,
  syncOnAccept: true,
  includeReadme: true,
  commitMessageTemplate: 'feat: solve {{problem}} ({{difficulty}})',
  defaultRepository: '',
  defaultBranch: 'main',
  defaultLanguage: 'python',
  notifications: true,
  darkMode: false,
  aiCommitMessages: true,
  syncInterval: 5,
  folderStructure: 'difficulty',
};

// ─── Store interface ──────────────────────────────────────────────────────────

interface AppState {
  // Existing
  user: User;
  settings: Settings;
  syncRecords: SyncRecord[];
  isSidebarCollapsed: boolean;
  searchQuery: string;

  // GitHub integration
  githubAuth: GitHubAuthState;
  githubRepos: GitHubRepo[];
  githubBranches: GitHubBranch[];
  reposLoading: boolean;
  branchesLoading: boolean;
  reposError: string | null;
  branchesError: string | null;

  // Existing actions
  setSettings: (settings: Partial<Settings>) => void;
  toggleSidebar: () => void;
  setSearchQuery: (query: string) => void;
  toggleDarkMode: () => void;

  // GitHub actions
  initGitHubAuth: () => Promise<void>;
  connectGitHub: () => Promise<void>;
  cancelGitHubAuth: () => Promise<void>;
  disconnectGitHub: () => Promise<void>;
  loadRepositories: () => Promise<void>;
  loadBranches: (owner: string, repo: string) => Promise<void>;
  createRepository: (name: string, isPrivate: boolean, description: string) => Promise<GitHubRepo>;
  setGitHubAuthSuccess: (user: GitHubAuthState['user'], token: string) => void;
  setGitHubAuthError: (error: string) => void;

  analytics: any;
  activity: any[];
  problems: Problem[];
  onboarding: OnboardingState;
  leetcodeAuth: LeetCodeAuthState;

  setUser: (user: User) => void;
  setProblems: (problems: Problem[]) => void;
  setAnalytics: (analytics: any) => void;
  setActivity: (activity: any[]) => void;
  setSyncRecords: (records: SyncRecord[]) => void;
  hydrateFromStorage: () => Promise<void>;
  ensureOnboarding: () => Promise<void>;
  importHistoricalSubmissions: () => Promise<void>;
  connectLeetCode: () => Promise<void>;
}

// ─── Store ────────────────────────────────────────────────────────────────────

registerBackgroundListeners();

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: emptyUser,
      settings: emptySettings,
      syncRecords: [],
      isSidebarCollapsed: false,
      searchQuery: '',

      githubAuth: initialGitHubAuth,
      githubRepos: [],
      githubBranches: [],
      reposLoading: false,
      branchesLoading: false,
      reposError: null,
      branchesError: null,
      
      // Real data instead of mocks
      analytics: {
        totalSynced: 0,
        totalPending: 0,
        totalFailed: 0,
        streak: 0,
        syncRate: 100,
        lastSyncDate: null,
      },
      activity: [],
      problems: [],
      onboarding: initialOnboardingState,
      leetcodeAuth: initialLeetCodeAuth,

      // ── Existing actions ──────────────────────────────────────────────────

      setSettings: (partial) =>
        set((state) => ({
          settings: { ...state.settings, ...partial },
        })),

      setUser: (user) => set({ user }),
      setProblems: (problems) => set({ problems }),
      setAnalytics: (analytics) => set({ analytics }),
      setActivity: (activity) => set({ activity }),
      setSyncRecords: (records) => set({ syncRecords: records }),

      hydrateFromStorage: async () => {
        try {
          const stored = await sendBg<any>({ type: 'APP_GET_STATE' });
          if (stored?.user) set({ user: stored.user });
          if (stored?.settings) set((state) => ({ settings: { ...state.settings, ...stored.settings } }));
          if (stored?.syncRecords) set({ syncRecords: stored.syncRecords });
          if (stored?.analytics) set({ analytics: stored.analytics });
          if (stored?.activity) set({ activity: stored.activity });
          if (stored?.problems) set({ problems: stored.problems });
          if (stored?.onboarding) set({ onboarding: { ...initialOnboardingState, ...stored.onboarding } });
          if (stored?.leetcodeAuth) set({ leetcodeAuth: stored.leetcodeAuth });
        } catch {
          // Keep empty state if no persisted state exists.
        }

        try {
          const auth = await getGitHubAuth();
          if (auth?.token && auth.user) {
            set((state) => ({
              githubAuth: {
                status: 'connected',
                token: auth.token,
                user: auth.user,
                error: null,
                deviceFlow: null,
              },
              user: {
                ...state.user,
                githubUsername: auth.user.login || state.user.githubUsername,
                name: auth.user.name || state.user.name,
                avatar: auth.user.avatar_url || state.user.avatar,
                email: state.user.email,
              },
            }));
            await get().ensureOnboarding();
          }
        } catch {
          // Ignore storage read failures and rely on the background worker.
        }
      },

      ensureOnboarding: async () => {
        const state = get();
        const githubConnected = Boolean(state.githubAuth.token);
        const leetcodeConnected = Boolean(state.leetcodeAuth.profile?.connected);
        const onboardingComplete = githubConnected && leetcodeConnected && state.onboarding.historyImported;

        set({
          onboarding: {
            ...state.onboarding,
            isComplete: onboardingComplete,
            completedSteps: [
              ...(githubConnected ? ['github'] : []),
              ...(leetcodeConnected ? ['leetcode'] : []),
              ...(state.onboarding.historyImported ? ['history'] : []),
            ],
          },
        });
      },

      importHistoricalSubmissions: async () => {
        set((state) => ({
          onboarding: {
            ...state.onboarding,
            isImportingHistory: true,
            importProgress: 10,
            lastError: null,
          },
        }));

        try {
          const imported = await sendBg<any[]>({ type: 'LEETCODE_IMPORT_HISTORY' });
          set((state) => ({
            problems: imported || [],
            onboarding: {
              ...state.onboarding,
              isImportingHistory: false,
              historyImported: true,
              importProgress: 100,
              completedSteps: Array.from(new Set([...state.onboarding.completedSteps, 'history'])),
              lastImportedAt: new Date().toISOString(),
            },
          }));
          get().ensureOnboarding();
        } catch (error) {
          set((state) => ({
            onboarding: {
              ...state.onboarding,
              isImportingHistory: false,
              importProgress: 0,
              lastError: error instanceof Error ? error.message : 'Failed to import history',
            },
          }));
        }
      },

      connectLeetCode: async () => {
        set({ leetcodeAuth: { status: 'pending', profile: null, error: null } });
        try {
          const profile = await sendBg<any>({ type: 'LEETCODE_GET_PROFILE' });
          const connectedProfile = profile?.connected ? profile : null;
          set({ leetcodeAuth: { status: connectedProfile ? 'connected' : 'error', profile: connectedProfile, error: connectedProfile ? null : 'Unable to detect a LeetCode profile from the current tab.' } });
          if (connectedProfile) {
            set((state) => ({
              user: {
                ...state.user,
                leetcodeUsername: connectedProfile.username || state.user.leetcodeUsername,
                name: connectedProfile.displayName || state.user.name,
              },
            }));
            await get().ensureOnboarding();
            if (!get().onboarding.historyImported) {
              await get().importHistoricalSubmissions();
            }
          }
        } catch (error) {
          set({ leetcodeAuth: { status: 'error', profile: null, error: error instanceof Error ? error.message : 'Failed to connect LeetCode' } });
        }
      },

      toggleSidebar: () =>
        set((state) => ({
          isSidebarCollapsed: !state.isSidebarCollapsed,
        })),

      setSearchQuery: (query) => set({ searchQuery: query }),

      toggleDarkMode: () =>
        set((state) => {
          const darkMode = !state.settings.darkMode;
          document.documentElement.classList.toggle('dark', darkMode);
          return { settings: { ...state.settings, darkMode } };
        }),

      // ── GitHub: restore session on startup ────────────────────────────────

      initGitHubAuth: async () => {
        try {
          const storedAuth = await getGitHubAuth();
          if (storedAuth) {
            set((state) => ({
              githubAuth: {
                status: 'connected',
                token: storedAuth.token,
                user: storedAuth.user,
                error: null,
                deviceFlow: null,
              },
              user: {
                ...state.user,
                githubUsername: storedAuth.user.login || state.user.githubUsername,
                name: storedAuth.user.name || state.user.name,
                avatar: storedAuth.user.avatar_url || state.user.avatar,
                email: state.user.email,
              },
            }));
            await get().ensureOnboarding();
            return;
          }

          try {
            const auth = await sendBg<{ token: string; user: GitHubAuthState['user'] } | null>({
              type: 'GITHUB_GET_AUTH',
            });

            if (auth) {
              set({
                githubAuth: {
                  status: 'connected',
                  token: auth.token,
                  user: auth.user,
                  error: null,
                  deviceFlow: null,
                },
              });
            }
          } catch {
            // Silently fail on init — user just isn't connected
          }
        } catch {
          // Silently fail on init — user just isn't connected
        }
      },

      // ── GitHub: start Device Flow ─────────────────────────────────────────

      connectGitHub: async () => {
        console.debug(`${AUTH_DEBUG_PREFIX} button click -> starting GitHub auth flow`);
        stopGitHubAuthPolling();
        set({
          githubAuth: {
            ...initialGitHubAuth,
            status: 'pending_device_flow',
            error: null,
          },
        });

        try {
          console.debug(`${AUTH_DEBUG_PREFIX} sending GITHUB_START_AUTH message to background worker`);
          const deviceFlow = await sendBg<{
            user_code: string;
            verification_uri: string;
            expires_in: number;
            interval: number;
          }>({ type: 'GITHUB_START_AUTH' });

          console.debug(`${AUTH_DEBUG_PREFIX} background returned device flow`, deviceFlow);
          set({
            githubAuth: {
              status: 'polling',
              token: null,
              user: null,
              error: null,
              deviceFlow: {
                user_code: deviceFlow.user_code,
                verification_uri: deviceFlow.verification_uri,
                expires_in: deviceFlow.expires_in,
              },
            },
          });
          console.debug(`${AUTH_DEBUG_PREFIX} popup state updated -> polling for authorization`);

          githubAuthPollingTimer = window.setInterval(() => {
            void (async () => {
              try {
                const auth = await getGitHubAuth();
                if (auth?.token && auth.user) {
                  stopGitHubAuthPolling();
                  get().setGitHubAuthSuccess(auth.user, auth.token);
                }
              } catch (err) {
                console.debug(`${AUTH_DEBUG_PREFIX} polling storage fallback failed`, err);
              }
            })();
          }, 2000);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to start authentication';
          console.error(`${AUTH_DEBUG_PREFIX} auth request failed`, err);
          stopGitHubAuthPolling();
          set({
            githubAuth: {
              ...initialGitHubAuth,
              status: 'error',
              error: message,
            },
          });
        } finally {
          console.debug(`${AUTH_DEBUG_PREFIX} auth flow promise settled; loading state should now be cleared or transitioned`);
        }
      },

      cancelGitHubAuth: async () => {
        stopGitHubAuthPolling();
        await sendBg({ type: 'GITHUB_CANCEL_AUTH' }).catch(() => {});
        set({ githubAuth: initialGitHubAuth });
      },

      disconnectGitHub: async () => {
        stopGitHubAuthPolling();
        await sendBg({ type: 'GITHUB_LOGOUT' }).catch(() => {});
        await clearGitHubAuth().catch(() => {});
        set({
          githubAuth: initialGitHubAuth,
          githubRepos: [],
          githubBranches: [],
        });
      },

      // Called by the background message listener
      setGitHubAuthSuccess: (user, token) => {
        stopGitHubAuthPolling();
        console.debug(`${AUTH_DEBUG_PREFIX} callback received -> updating popup state to connected`, { user: user?.login, tokenLength: token?.length });
        void saveGitHubAuth(token, user as NonNullable<GitHubAuthState['user']> & { id: number; email: string | null; followers: number });
        set({
          githubAuth: {
            status: 'connected',
            token,
            user,
            error: null,
            deviceFlow: null,
          },
          user: {
            ...get().user,
            githubUsername: user?.login || get().user.githubUsername,
            name: user?.name || get().user.name,
            avatar: user?.avatar_url || get().user.avatar,
            email: get().user.email,
          },
        });
        get().loadRepositories();
        get().ensureOnboarding();
      },

      setGitHubAuthError: (error) => {
        stopGitHubAuthPolling();
        console.error(`${AUTH_DEBUG_PREFIX} auth error surfaced to UI`, error);
        set({
          githubAuth: {
            ...initialGitHubAuth,
            status: 'error',
            error,
          },
        });
      },

      // ── GitHub: repositories ──────────────────────────────────────────────

      loadRepositories: async () => {
        set({ reposLoading: true, reposError: null });
        try {
          const repos = await sendBg<GitHubRepo[]>({ type: 'GITHUB_LIST_REPOS' });
          set({ githubRepos: repos, reposLoading: false });
        } catch (err) {
          set({
            reposLoading: false,
            reposError: err instanceof Error ? err.message : 'Failed to load repositories',
          });
        }
      },

      // ── GitHub: branches ──────────────────────────────────────────────────

      loadBranches: async (owner, repo) => {
        set({ branchesLoading: true, branchesError: null, githubBranches: [] });
        try {
          const branches = await sendBg<GitHubBranch[]>({
            type: 'GITHUB_LIST_BRANCHES',
            owner,
            repo,
          });
          set({ githubBranches: branches, branchesLoading: false });
        } catch (err) {
          set({
            branchesLoading: false,
            branchesError: err instanceof Error ? err.message : 'Failed to load branches',
          });
        }
      },

      // ── GitHub: create repository ─────────────────────────────────────────

      createRepository: async (name, isPrivate, description) => {
        const repo = await sendBg<GitHubRepo>({
          type: 'GITHUB_CREATE_REPO',
          name,
          isPrivate,
          description,
        });

        set((state) => ({
          githubRepos: [repo, ...state.githubRepos],
          settings: { ...state.settings, defaultRepository: repo.full_name },
        }));

        return repo;
      },
    }),
    {
      name: 'githubsync-storage',
      storage: createJSONStorage(() => chromeStorage),
      partialize: (state) => ({
        settings: state.settings,
        syncRecords: state.syncRecords,
        analytics: state.analytics,
        activity: state.activity,
        problems: state.problems,
        onboarding: state.onboarding,
        leetcodeAuth: state.leetcodeAuth,
        user: state.user,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.settings.darkMode) {
          document.documentElement.classList.add('dark');
        }
      },
    }
  )
);

// ─── Derived hooks ────────────────────────────────────────────────────────────

export const useAnalytics = () => useAppStore((s) => s.analytics);
export const useRepositories = () => useAppStore((s) => s.githubRepos);
export const useActivity = () => useAppStore((s) => s.activity);
export const useProblems = () => useAppStore((s) => s.problems);
export const useDashboardStats = () => useAppStore((s) => {
  const analytics = s.analytics;
  return [
    { label: 'Total Synced', value: analytics.totalSynced, change: 0, trend: 'neutral' as const, icon: 'GitBranch' },
    { label: 'Success Rate', value: `${analytics.syncRate}%`, change: 0, trend: 'neutral' as const, icon: 'CheckCircle' },
    { label: 'Active Streak', value: `${analytics.streak} days`, change: 0, trend: 'neutral' as const, icon: 'Flame' },
    { label: 'Repositories', value: s.githubRepos.length, change: 0, trend: 'neutral' as const, icon: 'FolderGit2' },
  ];
});
