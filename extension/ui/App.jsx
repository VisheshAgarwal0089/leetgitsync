import React, { useEffect, useRef, useState } from 'react';
import { platform, request } from '../lib/compat.js';
import { emptyConfig } from '../lib/config.js';
import { Button } from './button.jsx';
import { Card } from './card.jsx';
import { Input } from './input.jsx';
const fields = [['owner', 'GitHub owner', 'Your username or organization'], ['repository', 'Repository name', 'Repository name'], ['branch', 'Target branch', 'Existing branch name'], ['directory', 'Solutions directory', 'solutions']];
const pauseMessages = {
  offline: 'Offline. Synchronization will resume when the connection returns.',
  rate_limited: 'GitHub rate limit reached. Synchronization will resume automatically after reset.',
  unauthenticated: 'Synchronization is paused until GitHub is connected.',
  authentication_expired: 'GitHub authentication expired. Reconnect to resume synchronization.',
  misconfigured: 'Synchronization is paused until valid repository settings are saved.',
  queue_full: 'Queue capacity reached. Retry or resolve failed jobs before capturing more submissions.',
  migration_failed: 'Stored data migration failed. Synchronization is paused to protect existing data.',
};
export function App({ popup = false }) {
  const [state, setState] = useState(null);
  const [config, setConfig] = useState(emptyConfig);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const hydrated = useRef(false);
  const running = useRef(false);
  useEffect(() => {
    let active = true;
    let refreshing = false;
    async function refresh() {
      if (refreshing || running.current) return;
      refreshing = true;
      try {
        const next = await request('GET_STATE');
        if (active) {
          setState(next);
          if (!hydrated.current) { setConfig(next.config); hydrated.current = true; }
        }
      } catch { if (active) setError('Could not load extension state. Reload the extension and try again.'); }
      finally { refreshing = false; }
    }
    void refresh();
    const timer = setInterval(refresh, 2000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  async function run(type, data, success) {
    running.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request(type, data);
      if (result?.config) setState(result);
      setNotice(success || '');
    } catch (error) { setError(error.message); }
    finally { running.current = false; setBusy(false); }
  }
  function saveConfiguration() {
    const changed = fields.some(([name]) => config[name] !== state?.config?.[name]);
    let confirmPending = false;
    if (changed && state?.queue?.activeCount > 0) {
      confirmPending = window.confirm('Pending submissions will continue to their original repository, branch, and directory. Save the new configuration for future submissions?');
      if (!confirmPending) return;
    }
    void run('SAVE_CONFIG', { config, confirmPending }, 'Configuration saved on this browser.');
  }
  return <main className={`app ${popup ? 'popup' : 'options'}`}>
    <header><h1>LeetGitSync</h1><p className="muted">Your LeetCode solutions, connected to GitHub.</p></header>
    {!state && <p role="status">Loading configuration…</p>}
    <Card className="panel">
      <h2>GitHub connection</h2>
      {state?.user ? <>
        <p className="status">Connected as {state.user.login}</p>
        <div className="actions"><Button disabled={busy} variant="secondary" onClick={() => run('VERIFY_AUTH', null, 'GitHub connection verified.')}>Verify connection</Button><Button disabled={busy} variant="outline" onClick={() => run('DISCONNECT', null, 'Disconnected. Stored authentication cleared.')}>Disconnect</Button></div>
      </> : state?.flow ? <>
        <p>Enter this code on GitHub to authorize LeetGitSync:</p>
        <p className="code">{state.flow.user_code}</p>
        <a href="https://github.com/login/device" target="_blank" rel="noreferrer">Open GitHub authorization</a>
        <p className="muted">Waiting for authorization. You can close this popup and return. Code expires at {new Date(state.flow.expiresAt).toLocaleTimeString()}.</p>
        {state.flow.status === 'slow_down' && <p className="muted">GitHub requested slower polling. Authorization will continue automatically.</p>}
        {state.flow.status === 'rate_limited' && <p className="error">Authorization is rate limited and will retry automatically.</p>}
        {state.flow.status === 'temporary_network_failure' && <p className="error">Network unavailable. Authorization will retry automatically.</p>}
        <Button disabled={busy} variant="outline" onClick={() => run('CANCEL_AUTH')}>Cancel authorization</Button>
      </> : <>
        <p className="muted">Authorize with GitHub Device Flow. Repository access supports public and private repositories.</p>
        <Button disabled={busy || !state} onClick={() => run('START_AUTH')}>Connect GitHub</Button>
      </>}
      {state?.error && <p className="error" role="alert">{state.error}</p>}
    </Card>
    <Card className="panel">
      <h2>Synchronization queue</h2>
      <p className="muted">{state?.queue?.activeCount ?? 0} submission{state?.queue?.activeCount === 1 ? '' : 's'} waiting to synchronize with GitHub.</p>
      {state?.queue?.paused && <p className="notice error">{pauseMessages[state.queue.paused.reason] || 'Synchronization is paused.'}{state.queue.paused.until ? ` Retry after ${new Date(state.queue.paused.until).toLocaleTimeString()}.` : ''}</p>}
      {state?.queue?.queueFull && <p className="notice error">Queue full: {state.queue.activeCount}/{state.queue.limits.queued} active and {state.queue.failedCount}/{state.queue.limits.failed} failed.</p>}
      {!!state?.queue?.retryingCount && <p className="muted">Retrying {state.queue.retryingCount} submission{state.queue.retryingCount === 1 ? '' : 's'} with bounded backoff.</p>}
      {!!state?.queue?.failedCount && <p className="error">{state.queue.failedCount} synchronization job{state.queue.failedCount === 1 ? '' : 's'} require attention.</p>}
      {state?.queue?.latestFailed && <div className="notice error"><p>{state.queue.latestFailed.problemTitle}: {state.queue.latestFailed.error}</p><Button disabled={busy} variant="outline" onClick={() => run('RETRY_SYNC_JOB', { jobId: state.queue.latestFailed.id }, 'Failed job returned to the queue.')}>Retry failed job</Button></div>}
      {state?.queue?.lastSynced && <p className="status">Last synchronized: {state.queue.lastSynced.commitUrl ? <a href={state.queue.lastSynced.commitUrl} target="_blank" rel="noreferrer">{state.queue.lastSynced.problemTitle}</a> : state.queue.lastSynced.problemTitle}</p>}
    </Card>
    <Card className="panel diagnostics">
      <h2>Live integration diagnostics</h2>
      <p className="muted">Reload the LeetCode problem tab after reloading the unpacked extension. Diagnostics contain status fields only and never include submitted code or credentials.</p>
      {state?.capture?.last && <p className="status">Captured {state.capture.last.problemTitle} (submission {state.capture.last.submissionId}).</p>}
      {!state?.diagnostics?.length && <p className="muted">No LeetCode activity recorded yet.</p>}
      {!!state?.diagnostics?.length && <ol className="diagnostic-list">
        {state.diagnostics.slice(0, 12).map((item, index) => <li key={`${item.at}-${index}`}>
          <strong>{item.stage.replaceAll('_', ' ').toLowerCase()}</strong>
          {item.slug && <span> · {item.slug}</span>}
          {item.submissionId && <span> · #{item.submissionId}</span>}
          {item.status && <span> · {item.status}</span>}
          {item.missingFields?.length && <span> · missing: {item.missingFields.join(', ')}</span>}
          {item.errorCode && <span> · {item.errorCode}</span>}
        </li>)}
      </ol>}
    </Card>
    <Card className="panel">
      <h2>Repository configuration</h2>
      <form className="fields" onSubmit={(event) => { event.preventDefault(); saveConfiguration(); }}>
        {fields.map(([name, label, placeholder]) => <label key={name} htmlFor={name}>{label}<Input id={name} name={name} required autoComplete="off" spellCheck={false} maxLength={name === 'directory' ? 240 : 255} placeholder={placeholder} value={config[name]} disabled={busy || !state} onChange={(event) => { setConfig({ ...config, [name]: event.target.value }); setNotice(''); setError(''); }} /></label>)}
        <p className="muted">Use an existing repository and branch. A new empty repository needs an initial commit first; creating a root README.md is the simplest setup. Accepted source code and problem metadata are sent only to GitHub and stored in the configured repository.</p>
        <div className="actions"><Button type="submit" disabled={busy || !state}>Save configuration</Button><Button type="button" variant="outline" disabled={busy || !state?.user} onClick={() => run('VALIDATE_CONFIG', config, 'Repository write access and branch verified. Save to keep these values.')}>Validate repository</Button></div>
      </form>
    </Card>
    {error && <p role="alert" className="notice error">{error}</p>}
    {notice && <p role="status" className="notice status">{notice}</p>}
    {busy && <p role="status" className="muted">Working…</p>}
    <footer><p className="muted">Each accepted solution and the managed README index are committed together.</p>{popup && <Button variant="link" onClick={() => platform.runtime.openOptionsPage().catch(() => setError('Could not open settings. Try the extension details page.'))}>Open full settings</Button>}</footer>
  </main>;
}
