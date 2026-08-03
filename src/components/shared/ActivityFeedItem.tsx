import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { ActivityItem } from '@/types';
import { GitBranch, AlertCircle, Settings, Trophy } from 'lucide-react';
import { motion } from 'framer-motion';

const activityIcons = {
  sync: GitBranch,
  error: AlertCircle,
  config: Settings,
  milestone: Trophy,
};

const activityColors = {
  sync: 'text-success bg-success/10',
  error: 'text-destructive bg-destructive/10',
  config: 'text-muted-foreground bg-muted',
  milestone: 'text-warning bg-warning/10',
};

interface ActivityFeedItemProps {
  item: ActivityItem;
  index?: number;
}

export function ActivityFeedItem({ item, index = 0 }: ActivityFeedItemProps) {
  const Icon = activityIcons[item.type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.3 }}
      className="flex gap-3 py-3"
    >
      <div className={cn('rounded-full p-2 h-fit shrink-0', activityColors[item.type])}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium truncate">{item.title}</p>
          <span className="text-xs text-muted-foreground shrink-0">
            {formatRelativeTime(item.timestamp)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{item.description}</p>
        {item.metadata && (
          <div className="flex gap-2 pt-1">
            {Object.entries(item.metadata).map(([key, value]) => (
              <Badge key={key} variant="secondary" className="text-[10px] font-mono">
                {value}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

interface UserAvatarProps {
  name: string;
  avatar: string;
  size?: 'sm' | 'md' | 'lg';
  showName?: boolean;
  subtitle?: string;
}

export function UserAvatar({ name, avatar, size = 'md', showName = false, subtitle }: UserAvatarProps) {
  const sizeClasses = {
    sm: 'h-7 w-7',
    md: 'h-9 w-9',
    lg: 'h-11 w-11',
  };

  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  return (
    <div className="flex items-center gap-2.5">
      <Avatar className={sizeClasses[size]}>
        <AvatarImage src={avatar} alt={name} />
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      {showName && (
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{name}</p>
          {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
        </div>
      )}
    </div>
  );
}
