import { Badge } from '@/components/ui/badge';
import { cn, getDifficultyColor } from '@/lib/utils';
import type { Problem } from '@/types';
import { motion } from 'framer-motion';

interface ProblemTagProps {
  problem: Problem;
  index?: number;
}

export function ProblemTag({ problem, index = 0 }: ProblemTagProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05, duration: 0.25 }}
      className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border bg-card hover:bg-accent/30 transition-colors cursor-default"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Badge
          variant="outline"
          className={cn('text-[10px] shrink-0 border', getDifficultyColor(problem.difficulty))}
        >
          {problem.difficulty[0]}
        </Badge>
        <span className="text-sm font-medium truncate">{problem.title}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {problem.tags.slice(0, 2).map((tag) => (
          <Badge key={tag} variant="secondary" className="text-[10px] hidden sm:inline-flex">
            {tag}
          </Badge>
        ))}
        <span className="text-xs text-muted-foreground font-mono">{problem.acceptanceRate}%</span>
      </div>
    </motion.div>
  );
}
