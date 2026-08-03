import { Badge } from '@/components/ui/badge';
import { cn, getDifficultyColor, getStatusColor, formatRelativeTime } from '@/lib/utils';
import type { SyncRecord } from '@/types';
import {
  CheckCircle2,
  Clock,
  XCircle,
  SkipForward,
  GitCommit,
  ExternalLink,
} from 'lucide-react';
import { motion } from 'framer-motion';

const statusIcons = {
  synced: CheckCircle2,
  pending: Clock,
  failed: XCircle,
  skipped: SkipForward,
};

interface SyncRecordRowProps {
  record: SyncRecord;
  index?: number;
  compact?: boolean;
}

export function SyncRecordRow({ record, index = 0, compact = false }: SyncRecordRowProps) {
  const StatusIcon = statusIcons[record.status];

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className={cn(
        'group flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-accent/50 transition-colors cursor-default',
        compact && 'px-3 py-2'
      )}
    >
      <div className={cn('rounded-full p-1.5', getStatusColor(record.status))}>
        <StatusIcon className="h-3.5 w-3.5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{record.problemTitle}</span>
          <Badge
            variant="outline"
            className={cn('text-[10px] px-1.5 py-0 h-5 border', getDifficultyColor(record.difficulty))}
          >
            {record.difficulty}
          </Badge>
        </div>
        {!compact && (
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span className="font-mono">{record.language}</span>
            <span>·</span>
            <span>{record.repository}</span>
            {record.commitSha && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1 font-mono">
                  <GitCommit className="h-3 w-3" />
                  {record.commitSha}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-muted-foreground">{formatRelativeTime(record.syncedAt)}</span>
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </motion.div>
  );
}
