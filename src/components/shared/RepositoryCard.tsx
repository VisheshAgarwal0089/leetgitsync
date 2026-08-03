import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { GitHubRepo } from '@/types';
import { Star, Lock, Globe, GitBranch, Clock } from 'lucide-react';
import { motion } from 'framer-motion';

interface RepositoryCardProps {
  repository: GitHubRepo;
  index?: number;
  selected?: boolean;
  onClick?: () => void;
}

export function RepositoryCard({ repository, index = 0, selected, onClick }: RepositoryCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.35 }}
    >
      <Card
        className={cn(
          'cursor-pointer transition-all duration-200 hover:border-muted-foreground/30 hover:shadow-sm',
          selected && 'border-primary/50 bg-accent/30'
        )}
        onClick={onClick}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">{repository.name}</span>
              {repository.private ? (
                <Lock className="h-3 w-3 text-muted-foreground" />
              ) : (
                <Globe className="h-3 w-3 text-muted-foreground" />
              )}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Star className="h-3 w-3" />
              {repository.stargazers_count}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
            {repository.description ?? 'No description'}
          </p>
          <div className="flex items-center justify-between">
            <Badge variant="secondary" className="text-[10px] font-mono">
              {repository.language ?? 'Unknown'}
            </Badge>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatRelativeTime(repository.updated_at)}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
