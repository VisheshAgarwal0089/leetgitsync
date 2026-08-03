import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatNumber(num: number): string {
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num.toString();
}

export function getDifficultyColor(difficulty: string): string {
  switch (difficulty.toLowerCase()) {
    case 'easy':
      return 'text-success bg-success/10 border-success/20';
    case 'medium':
      return 'text-warning bg-warning/10 border-warning/20';
    case 'hard':
      return 'text-destructive bg-destructive/10 border-destructive/20';
    default:
      return 'text-muted-foreground bg-muted border-border';
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'synced':
      return 'text-success bg-success/10';
    case 'pending':
      return 'text-warning bg-warning/10';
    case 'failed':
      return 'text-destructive bg-destructive/10';
    case 'skipped':
      return 'text-muted-foreground bg-muted';
    default:
      return 'text-muted-foreground bg-muted';
  }
}

export function openDashboard(path = '/dashboard'): void {
  const url = chrome.runtime.getURL(`src/dashboard/index.html#${path}`);
  chrome.tabs.create({ url });
}
