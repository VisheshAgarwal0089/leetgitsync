export type Difficulty = 'Easy' | 'Medium' | 'Hard';
export type SyncStatus = 'synced' | 'pending' | 'failed' | 'skipped';
export type Language = 'python' | 'javascript' | 'typescript' | 'java' | 'cpp' | 'go' | 'rust';
export type FolderStructure = 'difficulty' | 'language' | 'flat' | 'difficulty-language';

export type GitHubAuthStatus = 'idle' | 'pending_device_flow' | 'polling' | 'connected' | 'error';

export interface GitHubAuthState {
  status: GitHubAuthStatus;
  token: string | null;
  user: {
    login: string;
    name: string | null;
    avatar_url: string;
    html_url: string;
    public_repos: number;
  } | null;
  error: string | null;
  // Device flow data shown to user
  deviceFlow: {
    user_code: string;
    verification_uri: string;
    expires_in: number;
  } | null;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  html_url: string;
  default_branch: string;
  stargazers_count: number;
  language: string | null;
  updated_at: string;
  owner: { login: string; avatar_url: string };
}

export interface GitHubBranch {
  name: string;
  protected: boolean;
  commit: { sha: string };
}

export interface User {
  id: string;
  name: string;
  email: string | null;
  avatar: string;
  leetcodeUsername: string;
  githubUsername: string;
  plan: 'free' | 'pro';
}

export interface Problem {
  id: string;
  title: string;
  slug: string;
  difficulty: Difficulty;
  tags: string[];
  acceptanceRate: number;
  solvedAt?: string;
}

export interface SyncRecord {
  id: string;
  problemId: string;
  problemTitle: string;
  difficulty: Difficulty;
  language: Language;
  status: SyncStatus;
  repository: string;
  commitSha: string;
  syncedAt: string;
  duration: number;
  message?: string;
}

export interface Repository {
  id: string;
  name: string;
  fullName: string;
  description: string;
  isPrivate: boolean;
  stars: number;
  lastSync: string;
  problemCount: number;
  language: string;
}

export interface AnalyticsData {
  totalSynced: number;
  totalPending: number;
  totalFailed: number;
  syncRate: number;
  streak: number;
  weeklyActivity: { day: string; synced: number; failed: number }[];
  difficultyBreakdown: { difficulty: Difficulty; count: number; percentage: number }[];
  languageBreakdown: { language: Language; count: number; percentage: number }[];
  monthlyTrend: { month: string; synced: number }[];
}

export interface Settings {
  autoSync: boolean;
  syncOnAccept: boolean;
  includeReadme: boolean;
  commitMessageTemplate: string;
  defaultRepository: string;
  defaultBranch: string;
  defaultLanguage: Language;
  notifications: boolean;
  darkMode: boolean;
  aiCommitMessages: boolean;
  syncInterval: number;
  folderStructure: FolderStructure;
}

export interface LeetCodeProfile {
  username: string | null;
  displayName: string | null;
  connected: boolean;
  message?: string;
}

export interface LeetCodeAuthState {
  status: 'idle' | 'pending' | 'connected' | 'error';
  profile: LeetCodeProfile | null;
  error: string | null;
}

export interface OnboardingState {
  isComplete: boolean;
  isImportingHistory: boolean;
  historyImported: boolean;
  importProgress: number;
  completedSteps: string[];
  lastError: string | null;
  lastImportedAt: string | null;
}

export interface ActivityItem {
  id: string;
  type: 'sync' | 'error' | 'config' | 'milestone';
  title: string;
  description: string;
  timestamp: string;
  metadata?: Record<string, string>;
}

export interface StatCard {
  label: string;
  value: string | number;
  change: number;
  trend: 'up' | 'down' | 'neutral';
  icon: string;
}

export type NavItem = {
  id: string;
  label: string;
  path: string;
  icon: string;
  badge?: number;
};
