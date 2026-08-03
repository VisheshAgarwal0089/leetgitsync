import { Search, Command } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  showShortcut?: boolean;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  className,
  showShortcut = true,
}: SearchInputProps) {
  return (
    <div className={cn('relative group', className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-foreground transition-colors" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-16 bg-muted/30 border-transparent focus:border-border focus:bg-background transition-all"
      />
      {showShortcut && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 text-muted-foreground">
          <kbd className="inline-flex h-5 items-center gap-0.5 rounded border bg-muted px-1.5 text-[10px] font-medium">
            <Command className="h-2.5 w-2.5" />K
          </kbd>
        </div>
      )}
    </div>
  );
}
