import { uploadFileWithRetry } from '@/lib/github';
import { getGitHubAuth } from '@/lib/storage';
import { showNotification } from '@/lib/notifications';

const REPO_STATE_STORAGE_KEY = 'githubsync-repo-state';

interface RepoEntry {
  problemId: string;
  title: string;
  slug: string;
  topic: string;
  language: string;
  difficulty: string;
  path: string;
  updatedAt: string;
}

interface RepoSyncState {
  version: number;
  repository: string | null;
  branch: string | null;
  entries: RepoEntry[];
  updatedAt: string;
}

// Map LeetCode languages to file extensions
const EXTENSION_MAP: Record<string, string> = {
  python3: 'py',
  python: 'py',
  cpp: 'cpp',
  java: 'java',
  c: 'c',
  csharp: 'cs',
  javascript: 'js',
  typescript: 'ts',
  php: 'php',
  swift: 'swift',
  kotlin: 'kt',
  dart: 'dart',
  golang: 'go',
  ruby: 'rb',
  scala: 'scala',
  rust: 'rs',
  racket: 'rkt',
  erlang: 'erl',
  elixir: 'ex',
};

function getFileExtension(language: string): string {
  return EXTENSION_MAP[language.toLowerCase()] || 'txt';
}

function sanitizePathSegment(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'untitled';
}

function getLanguageLabel(language: string): string {
  const normalized = language.toLowerCase();
  const labels: Record<string, string> = {
    python: 'Python',
    python3: 'Python',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    java: 'Java',
    cpp: 'C++',
    c: 'C',
    csharp: 'C#',
    go: 'Go',
    rust: 'Rust',
  };

  return labels[normalized] || language;
}

function getTopic(problem: any): string {
  const tags = problem?.tags || problem?.topicTags || [];
  const firstTopic = Array.isArray(tags) ? tags[0] : tags;
  return firstTopic ? String(firstTopic) : 'General';
}

function generateProblemPath(problem: any, language: string): string {
  const ext = getFileExtension(language);
  const topic = sanitizePathSegment(getTopic(problem));
  const title = sanitizePathSegment(problem.title || 'Untitled');
  const languageLabel = sanitizePathSegment(getLanguageLabel(language));
  return `${languageLabel}/${topic}/${title}.${ext}`;
}

function generateCommitMessage(template: string, problem: any, language: string, topic: string): string {
  const resolvedTemplate = template?.trim() || `feat: add ${getLanguageLabel(language)} solution for {{problem}}`;

  return resolvedTemplate
    .replace(/\{\{problem\}\}/g, problem.title || 'solution')
    .replace(/\{\{difficulty\}\}/g, problem.difficulty || 'Unknown')
    .replace(/\{\{language\}\}/g, getLanguageLabel(language))
    .replace(/\{\{topic\}\}/g, topic)
    .trim();
}

function buildRootReadme(state: RepoSyncState): string {
  const entries = [...state.entries].sort((a, b) => a.title.localeCompare(b.title));
  const topicGroups = entries.reduce<Record<string, RepoEntry[]>>((groups, entry) => {
    const topic = entry.topic || 'General';
    groups[topic] = groups[topic] || [];
    groups[topic].push(entry);
    return groups;
  }, {});

  const topicSections = Object.entries(topicGroups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([topic, topicEntries]) => {
      const rows = topicEntries
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((entry) => `- [${entry.title}](${entry.path}) — ${entry.difficulty} — ${entry.language}`)
        .join('\n');
      return `## ${topic}\n\n${rows}`;
    })
    .join('\n\n');

  const languageCount = new Set(entries.map((entry) => entry.language)).size;
  const difficultyCounts = entries.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.difficulty] = (counts[entry.difficulty] || 0) + 1;
    return counts;
  }, {});

  const difficultySummary = Object.entries(difficultyCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([difficulty, count]) => `${difficulty}: ${count}`)
    .join(', ');

  return `# LeetCode Solutions\n\n## Overview\n\n- Total Problems: ${entries.length}\n- Topics: ${Object.keys(topicGroups).length}\n- Languages: ${languageCount}\n- Difficulty Breakdown: ${difficultySummary || 'N/A'}\n\n## Problems by Topic\n\n${topicSections || 'No solutions synced yet.'}`;
}

async function loadRepoState(): Promise<RepoSyncState> {
  const result = await new Promise<Record<string, string>>((resolve) => {
    chrome.storage.local.get(REPO_STATE_STORAGE_KEY, (res) => resolve(res));
  });

  if (!result[REPO_STATE_STORAGE_KEY]) {
    return { version: 1, repository: null, branch: null, entries: [], updatedAt: new Date().toISOString() };
  }

  try {
    return JSON.parse(result[REPO_STATE_STORAGE_KEY]) as RepoSyncState;
  } catch {
    return { version: 1, repository: null, branch: null, entries: [], updatedAt: new Date().toISOString() };
  }
}

async function saveRepoState(state: RepoSyncState): Promise<void> {
  await new Promise<void>((resolve) => {
    chrome.storage.local.set({ [REPO_STATE_STORAGE_KEY]: JSON.stringify(state) }, () => resolve());
  });
}

export async function handleLeetCodeSync(payload: any) {
  try {
    const { problem, submission } = payload.data;

    // Get stored data from Zustand's chrome.storage persist
    const storeRaw = await new Promise<any>((resolve) => {
      chrome.storage.local.get('githubsync-storage', (res) => resolve(res['githubsync-storage']));
    });

    if (!storeRaw) throw new Error('Store not initialized');
    const storeState = JSON.parse(storeRaw).state;

    const settings = storeState.settings || {};
    let syncRecords = storeState.syncRecords || [];
    let analytics = storeState.analytics || { totalSynced: 0, totalPending: 0, totalFailed: 0, streak: 0, syncRate: 100, lastSyncDate: null };
    let activity = storeState.activity || [];

    const auth = await getGitHubAuth();
    const selectedRepo = settings.defaultRepository;
    const selectedBranch = settings.defaultBranch || 'main';

    if (!auth || !auth.token) {
      throw new Error('GitHub is not connected.');
    }

    if (!settings.autoSync) {
      console.log('[SyncEngine] Auto-sync is disabled. Skipping.');
      return;
    }

    if (!selectedRepo) {
      throw new Error('No GitHub repository selected.');
    }

    const [owner, repoName] = selectedRepo.split('/');
    const branch = selectedBranch;
    const language = submission.language || settings.defaultLanguage || 'python';
    const topic = getTopic(problem);
    const codePath = generateProblemPath(problem, language);
    const problemId = String(problem.id || problem.slug || problem.title || submission.id || 'unknown');
    const commitMsg = generateCommitMessage(
      settings.commitMessageTemplate || settings.commitMessage || '',
      problem,
      language,
      topic
    );

    const repoState = await loadRepoState();
    const existingEntry = repoState.entries.find((entry) => entry.problemId === problemId);
    const targetPath = existingEntry?.path || codePath;

    await uploadFileWithRetry(
      auth.token,
      owner,
      repoName,
      branch,
      targetPath,
      submission.code,
      commitMsg
    );

    const nextEntry: RepoEntry = {
      problemId,
      title: problem.title,
      slug: problem.slug || problem.title,
      topic,
      language: getLanguageLabel(language),
      difficulty: problem.difficulty || 'Unknown',
      path: targetPath,
      updatedAt: new Date().toISOString(),
    };

    repoState.entries = [...repoState.entries.filter((entry) => entry.problemId !== problemId), nextEntry];
    repoState.repository = selectedRepo;
    repoState.branch = branch;
    repoState.updatedAt = new Date().toISOString();
    await saveRepoState(repoState);

    const readmePath = 'README.md';
    const readmeContent = buildRootReadme(repoState);
    await uploadFileWithRetry(
      auth.token,
      owner,
      repoName,
      branch,
      readmePath,
      readmeContent,
      `docs: refresh solution index for ${problem.title}`
    );

    showNotification('LeetGitSync Success', `Synced ${problem.title} to GitHub.`);

    const syncRecord = {
      id: submission.id.toString(),
      problemId,
      problemTitle: problem.title,
      difficulty: problem.difficulty,
      language,
      status: 'success',
      timestamp: new Date().toISOString(),
      repository: selectedRepo,
      commitUrl: `https://github.com/${selectedRepo}/tree/${branch}/${targetPath}`,
    };

    syncRecords.unshift(syncRecord);
    if (syncRecords.length > 100) syncRecords.length = 100;

    analytics.totalSynced += 1;
    analytics.syncRate = Math.round((analytics.totalSynced / (analytics.totalSynced + analytics.totalFailed)) * 100);
    analytics.streak += 1;

    activity.unshift({
      id: Date.now().toString(),
      type: 'sync',
      title: `Synced ${problem.title}`,
      description: `Committed to ${selectedRepo}`,
      timestamp: new Date().toISOString(),
    });
    if (activity.length > 50) activity.length = 50;

    await new Promise<void>((resolve) => {
      storeState.syncRecords = syncRecords;
      storeState.analytics = analytics;
      storeState.activity = activity;
      chrome.storage.local.set({
        'githubsync-storage': JSON.stringify({ state: storeState, version: 0 })
      }, () => resolve());
    });
  } catch (error: any) {
    console.error('[SyncEngine] Sync failed:', error);
    showNotification('LeetGitSync Failed', error.message || 'Failed to sync to GitHub.', true);

    const storeRaw = await new Promise<any>((resolve) => {
      chrome.storage.local.get('githubsync-storage', (res) => resolve(res['githubsync-storage']));
    });
    if (storeRaw) {
      const storeState = JSON.parse(storeRaw).state;
      const analytics = storeState.analytics || { totalSynced: 0, totalPending: 0, totalFailed: 0, streak: 0, syncRate: 100 };
      analytics.totalFailed += 1;
      analytics.syncRate = Math.round((analytics.totalSynced / (analytics.totalSynced + analytics.totalFailed)) * 100);
      storeState.analytics = analytics;

      await new Promise<void>((resolve) => {
        chrome.storage.local.set({
          'githubsync-storage': JSON.stringify({ state: storeState, version: 0 })
        }, () => resolve());
      });
    }
  }
}
