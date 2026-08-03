import { Moon, Sun, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/shared/ActivityFeedItem';
import { SearchInput } from '@/components/shared/SearchInput';
import { useAppStore } from '@/store/useAppStore';
import { Separator } from '@/components/ui/separator';

export function Header() {
  const { user, settings, toggleDarkMode, searchQuery, setSearchQuery } = useAppStore();

  return (
    <header className="flex items-center justify-between gap-4 h-14 px-6 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10">
      <SearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search syncs, problems, repositories..."
        className="max-w-md"
      />

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-destructive animate-pulse-soft" />
        </Button>

        <Button variant="ghost" size="icon" onClick={toggleDarkMode}>
          {settings.darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <UserAvatar
          name={user.name}
          avatar={user.avatar}
          size="sm"
          showName
          subtitle={user.githubUsername}
        />
      </div>
    </header>
  );
}
