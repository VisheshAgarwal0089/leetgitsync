import { emptyConfig } from './config.js';

export const keys = { auth: 'githubsync-auth', flow: 'lgs-auth-flow-v1', config: 'lgs-config-v1', error: 'lgs-auth-error', captures: 'lgs-captures-v1', queue: 'lgs-sync-queue-v1', diagnostics: 'lgs-diagnostics-v1' };
export function createStorage(local) {
  return {
    async get(key) { return (await local.get(key))[key]; },
    async set(key, value) { await local.set({ [key]: value }); },
    async setMany(values) { await local.set(values); },
    async remove(key) { await local.remove(key); },
    async initialize() {
      if (local.setAccessLevel) await local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
      const values = await local.get([keys.auth, 'gh_token', 'gh_user', keys.config, 'githubsync-storage']);
      if (!values[keys.auth]?.token && values.gh_token && values.gh_user) await local.set({ [keys.auth]: { token: values.gh_token, user: values.gh_user } });
      if (!values[keys.config]) {
        try {
          const raw = values['githubsync-storage'];
          const old = typeof raw === 'string' ? JSON.parse(raw) : raw;
          const settings = old?.state?.settings || old?.settings;
          if (settings) {
            const [owner = '', repository = ''] = (settings.defaultRepository || '').split('/');
            await local.set({ [keys.config]: { ...emptyConfig, owner, repository, branch: settings.defaultBranch || '' } });
          }
        } catch { /* Keep unrelated legacy state intact if it cannot be migrated. */ }
      }
      await local.remove(['gh_token', 'gh_user', 'githubsync-device-flow']);
    },
    async disconnect() { await local.remove([keys.auth, keys.flow, keys.error, 'gh_token', 'gh_user', 'githubsync-device-flow']); },
  };
}
