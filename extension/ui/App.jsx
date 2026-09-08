import React, { useEffect, useRef, useState } from 'react';
import { platform, request } from '../lib/compat.js';
import { emptyConfig } from '../lib/config.js';
import { Button } from './button.jsx';
import { Card } from './card.jsx';
import { Input } from './input.jsx';
const fields = [['owner', 'GitHub owner', 'Your username or organization'], ['repository', 'Repository name', 'Repository name'], ['branch', 'Target branch', 'Existing branch name'], ['directory', 'Solutions directory', 'solutions']];
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
      <form className="fields" onSubmit={(event) => { event.preventDefault(); void run('SAVE_CONFIG', config, 'Configuration saved on this browser.'); }}>
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
