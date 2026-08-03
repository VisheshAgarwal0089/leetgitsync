import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  BarChart3,
  History,
  Settings,
  GitBranch,
  ChevronLeft,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useAppStore } from '@/store/useAppStore';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { id: 'analytics', label: 'Analytics', path: '/analytics', icon: BarChart3 },
  { id: 'history', label: 'Sync History', path: '/history', icon: History, badge: 4 },
  { id: 'settings', label: 'Settings', path: '/settings', icon: Settings },
];

export function Sidebar() {
  const { isSidebarCollapsed, toggleSidebar } = useAppStore();

  return (
    <TooltipProvider delayDuration={0}>
      <motion.aside
        initial={false}
        animate={{ width: isSidebarCollapsed ? 64 : 240 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="relative flex flex-col h-full bg-sidebar border-r border-sidebar-border shrink-0"
      >
        <div className="flex items-center gap-3 px-4 h-14 border-b border-sidebar-border">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary text-primary-foreground shrink-0">
            <GitBranch className="h-4 w-4" />
          </div>
          {!isSidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 min-w-0"
            >
              <span className="font-semibold text-sm truncate">GitHubSync AI</span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 gap-0.5">
                <Sparkles className="h-2.5 w-2.5" />
                Pro
              </Badge>
            </motion.div>
          )}
        </div>

        <nav className="flex-1 py-4 px-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const link = (
              <NavLink
                key={item.id}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150',
                    'hover:bg-sidebar-accent hover:text-sidebar-foreground',
                    isActive
                      ? 'bg-accent text-foreground shadow-sm'
                      : 'text-muted-foreground',
                    isSidebarCollapsed && 'justify-center px-2'
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!isSidebarCollapsed && (
                  <>
                    <span className="truncate">{item.label}</span>
                    {item.badge && (
                      <Badge variant="secondary" className="ml-auto text-[10px] h-5 min-w-5 px-1.5">
                        {item.badge}
                      </Badge>
                    )}
                  </>
                )}
              </NavLink>
            );

            if (isSidebarCollapsed) {
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right" className="flex items-center gap-2">
                    {item.label}
                    {item.badge && (
                      <Badge variant="secondary" className="text-[10px] h-4">
                        {item.badge}
                      </Badge>
                    )}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return link;
          })}
        </nav>

        <div className="p-2 border-t border-sidebar-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSidebar}
            className={cn('w-full', isSidebarCollapsed && 'px-2')}
          >
            <ChevronLeft
              className={cn(
                'h-4 w-4 transition-transform duration-200',
                isSidebarCollapsed && 'rotate-180'
              )}
            />
            {!isSidebarCollapsed && <span className="ml-2">Collapse</span>}
          </Button>
        </div>
      </motion.aside>
    </TooltipProvider>
  );
}
