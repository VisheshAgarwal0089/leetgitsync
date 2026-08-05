import { PageHeader } from '@/components/shared/PageHeader';
import { FadeIn } from '@/components/shared/AnimatedContainer';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAppStore } from '@/store/useAppStore';
import {
  Github,
  Bell,
  Sparkles,
  GitBranch,
  Clock,
  FileText,
  Save,
  FolderTree,
  MessageSquare,
} from 'lucide-react';
import { GitHubConnectCard } from '@/components/github/GitHubConnectCard';
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';

export function SettingsPage() {
  const { settings, setSettings, initGitHubAuth } = useAppStore();
  const [saved, setSaved] = useState(false);

  // Restore GitHub session from chrome.storage.local on mount
  useEffect(() => {
    initGitHubAuth();
  }, [initGitHubAuth]);

  const handleSave = () => {
    setSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-8 max-w-3xl">
      <FadeIn>
        <PageHeader
          title="Settings"
          description="Configure GitHub integration and sync preferences"
          actions={
            <Button
              size="sm"
              onClick={handleSave}
              className={saved ? 'bg-green-600 hover:bg-green-600 text-white transition-colors gap-2' : 'gap-2'}
            >
              {saved ? (
                <>
                  <Check className="h-4 w-4" />
                  Saved!
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          }
        />
      </FadeIn>

      {/* ── GitHub Integration ─────────────────────────────────────────────── */}
      <FadeIn delay={0.05}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Github className="h-4 w-4" />
              GitHub Integration
            </CardTitle>
            <CardDescription>
              Connect your GitHub account to enable repository syncing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GitHubConnectCard />
          </CardContent>
        </Card>
      </FadeIn>

      <FadeIn delay={0.06}>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              No separate LeetCode connection is required. Once GitHub is connected and a repository is selected, accepted submissions will sync automatically while you are viewing a LeetCode problem page.
            </p>
          </CardContent>
        </Card>
      </FadeIn>

      {/* ── Sync Configuration ─────────────────────────────────────────────── */}
      <FadeIn delay={0.1}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              Sync Configuration
            </CardTitle>
            <CardDescription>Control how and when solutions are synced</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Auto Sync */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Auto Sync</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically sync solutions after acceptance
                </p>
              </div>
              <Switch
                checked={settings.autoSync}
                onCheckedChange={(checked) => setSettings({ autoSync: checked })}
              />
            </div>

            <Separator />

            {/* Sync on Accept */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Sync on Accept</Label>
                <p className="text-xs text-muted-foreground">
                  Trigger sync immediately when a solution is accepted
                </p>
              </div>
              <Switch
                checked={settings.syncOnAccept}
                onCheckedChange={(checked) => setSettings({ syncOnAccept: checked })}
              />
            </div>

            <Separator />

            {/* AI Commit Messages */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI Commit Messages
                </Label>
                <p className="text-xs text-muted-foreground">
                  Generate intelligent commit messages using AI
                </p>
              </div>
              <Switch
                checked={settings.aiCommitMessages}
                onCheckedChange={(checked) => setSettings({ aiCommitMessages: checked })}
              />
            </div>

            <Separator />

            {/* Include README */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5" />
                  Include README
                </Label>
                <p className="text-xs text-muted-foreground">
                  Auto-generate README for each synced problem
                </p>
              </div>
              <Switch
                checked={settings.includeReadme}
                onCheckedChange={(checked) => setSettings({ includeReadme: checked })}
              />
            </div>

            <Separator />

            {/* Sync Interval */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5" />
                Sync Interval (minutes)
              </Label>
              <Input
                type="number"
                value={settings.syncInterval}
                onChange={(e) => setSettings({ syncInterval: Number(e.target.value) })}
                min={1}
                max={60}
              />
            </div>

            <Separator />

            {/* Commit Message Format */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5" />
                Commit Message Format
              </Label>
              <Input
                value={settings.commitMessageTemplate}
                onChange={(e) => setSettings({ commitMessageTemplate: e.target.value })}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Variables: {'{{problem}}'}, {'{{difficulty}}'}, {'{{language}}'}
              </p>
            </div>

            <Separator />

            {/* Folder Structure */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <FolderTree className="h-3.5 w-3.5" />
                Folder Structure
              </Label>
              <Select
                value={settings.folderStructure}
                onValueChange={(value) =>
                  setSettings({ folderStructure: value as typeof settings.folderStructure })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select structure" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="difficulty">
                    By Difficulty — <span className="font-mono text-xs text-muted-foreground">Easy/two-sum.py</span>
                  </SelectItem>
                  <SelectItem value="language">
                    By Language — <span className="font-mono text-xs text-muted-foreground">python/two-sum.py</span>
                  </SelectItem>
                  <SelectItem value="difficulty-language">
                    Difficulty / Language — <span className="font-mono text-xs text-muted-foreground">Easy/python/two-sum.py</span>
                  </SelectItem>
                  <SelectItem value="flat">
                    Flat — <span className="font-mono text-xs text-muted-foreground">two-sum.py</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Default Language */}
            <div className="space-y-2">
              <Label>Default Language</Label>
              <Select
                value={settings.defaultLanguage}
                onValueChange={(value) =>
                  setSettings({ defaultLanguage: value as typeof settings.defaultLanguage })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="python">Python</SelectItem>
                  <SelectItem value="typescript">TypeScript</SelectItem>
                  <SelectItem value="javascript">JavaScript</SelectItem>
                  <SelectItem value="java">Java</SelectItem>
                  <SelectItem value="cpp">C++</SelectItem>
                  <SelectItem value="go">Go</SelectItem>
                  <SelectItem value="rust">Rust</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </FadeIn>

      {/* ── Notifications & Appearance ─────────────────────────────────────── */}
      <FadeIn delay={0.15}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Notifications &amp; Appearance
            </CardTitle>
            <CardDescription>Customize alerts and visual preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Push Notifications</Label>
                <p className="text-xs text-muted-foreground">
                  Receive notifications for sync events
                </p>
              </div>
              <Switch
                checked={settings.notifications}
                onCheckedChange={(checked) => setSettings({ notifications: checked })}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Dark Mode</Label>
                <p className="text-xs text-muted-foreground">
                  Use dark theme across the extension
                </p>
              </div>
              <Switch
                checked={settings.darkMode}
                onCheckedChange={(checked) => {
                  setSettings({ darkMode: checked });
                  document.documentElement.classList.toggle('dark', checked);
                }}
              />
            </div>
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  );
}
