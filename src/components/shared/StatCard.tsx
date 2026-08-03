import {
  GitBranch,
  CheckCircle,
  Flame,
  FolderGit2,
  TrendingUp,
  TrendingDown,
  Minus,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { StaggerItem } from '@/components/shared/AnimatedContainer';

const iconMap: Record<string, LucideIcon> = {
  GitBranch,
  CheckCircle,
  Flame,
  FolderGit2,
};

interface StatCardProps {
  label: string;
  value: string | number;
  change?: number;
  trend?: 'up' | 'down' | 'neutral';
  icon?: string;
  className?: string;
}

export function StatCard({ label, value, change, trend = 'neutral', icon, className }: StatCardProps) {
  const Icon = icon ? iconMap[icon] : GitBranch;
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  return (
    <StaggerItem>
      <Card className={cn('group hover:border-muted-foreground/20 transition-all duration-300', className)}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground font-medium">{label}</p>
              <p className="text-2xl font-semibold tracking-tight">{value}</p>
              {change !== undefined && change !== 0 && (
                <div
                  className={cn(
                    'flex items-center gap-1 text-xs font-medium',
                    trend === 'up' && 'text-success',
                    trend === 'down' && 'text-destructive',
                    trend === 'neutral' && 'text-muted-foreground'
                  )}
                >
                  <TrendIcon className="h-3 w-3" />
                  <span>{Math.abs(change)}%</span>
                  <span className="text-muted-foreground font-normal">vs last week</span>
                </div>
              )}
            </div>
            <div className="rounded-lg bg-muted/50 p-2.5 group-hover:bg-muted transition-colors">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </CardContent>
      </Card>
    </StaggerItem>
  );
}
