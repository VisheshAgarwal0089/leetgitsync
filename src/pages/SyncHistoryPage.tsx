import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { FadeIn } from '@/components/shared/AnimatedContainer';
import { SyncRecordRow } from '@/components/shared/SyncRecordRow';
import { SearchInput } from '@/components/shared/SearchInput';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppStore } from '@/store/useAppStore';
import type { SyncStatus } from '@/types';
import { Filter, Download, RefreshCw } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function SyncHistoryPage() {
  const syncRecords = useAppStore((s) => s.syncRecords);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SyncStatus | 'all'>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all');

  const filteredRecords = useMemo(() => {
    return syncRecords.filter((record) => {
      const matchesSearch =
        record.problemTitle.toLowerCase().includes(search.toLowerCase()) ||
        record.repository.toLowerCase().includes(search.toLowerCase()) ||
        record.language.toLowerCase().includes(search.toLowerCase());

      const matchesStatus = statusFilter === 'all' || record.status === statusFilter;
      const matchesDifficulty =
        difficultyFilter === 'all' || record.difficulty === difficultyFilter;

      return matchesSearch && matchesStatus && matchesDifficulty;
    });
  }, [syncRecords, search, statusFilter, difficultyFilter]);

  const statusCounts = useMemo(() => {
    return syncRecords.reduce(
      (acc, record) => {
        acc[record.status] = (acc[record.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }, [syncRecords]);

  return (
    <div className="space-y-6">
      <FadeIn>
        <PageHeader
          title="Sync History"
          description={`${syncRecords.length} total sync records`}
          actions={
            <>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4" />
                Export
              </Button>
              <Button variant="outline" size="sm">
                <RefreshCw className="h-4 w-4" />
                Retry Failed
              </Button>
            </>
          }
        />
      </FadeIn>

      <FadeIn delay={0.05}>
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by problem, repository, or language..."
            className="flex-1"
            showShortcut={false}
          />
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as SyncStatus | 'all')}>
              <SelectTrigger className="w-[140px]">
                <Filter className="h-3.5 w-3.5 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="synced">Synced</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="skipped">Skipped</SelectItem>
              </SelectContent>
            </Select>
            <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Difficulty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="Easy">Easy</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="Hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </FadeIn>

      <FadeIn delay={0.1}>
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">
              All
              <Badge variant="secondary" className="ml-2 text-[10px] h-5">
                {syncRecords.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="synced">
              Synced
              <Badge variant="success" className="ml-2 text-[10px] h-5">
                {statusCounts.synced || 0}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="pending">
              Pending
              <Badge variant="warning" className="ml-2 text-[10px] h-5">
                {statusCounts.pending || 0}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="failed">
              Failed
              <Badge variant="destructive" className="ml-2 text-[10px] h-5">
                {statusCounts.failed || 0}
              </Badge>
            </TabsTrigger>
          </TabsList>

          {['all', 'synced', 'pending', 'failed'].map((tab) => (
            <TabsContent key={tab} value={tab}>
              <Card>
                <CardContent className="p-0">
                  {(tab === 'all' ? filteredRecords : filteredRecords.filter((r) => r.status === tab))
                    .length === 0 ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">
                      No sync records match your filters
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {(tab === 'all'
                        ? filteredRecords
                        : filteredRecords.filter((r) => r.status === tab)
                      ).map((record, i) => (
                        <SyncRecordRow key={record.id} record={record} index={i} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </FadeIn>
    </div>
  );
}
