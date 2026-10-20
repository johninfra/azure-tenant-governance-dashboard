import { accountKey, aborted, emptySnapshot, isAbort, SnapshotSession } from './snapshot.js';
import { createTokenProvider } from './auth.js';
import { createApiClient } from './api.js';
import { collectTenant } from './collect.js';

export function createDashboardController({ state, render, isInteractionRequired, collect = collectTenant,
  makeClient = createApiClient }) {
  const sessions = new SnapshotSession();

  function changeAccount(account, syncMsal = true) {
    const changed = accountKey(state.account) !== accountKey(account);
    if (changed || !account) {
      sessions.cancel();
      Object.assign(state, emptySnapshot(), { loading: false, error: '', search: '' });
    }
    state.account = account;
    if (syncMsal && changed) state.msal?.setActiveAccount(account);
    render();
  }

  async function refresh() {
    if (!state.account) return;
    const run = sessions.begin(state.account), msal = state.msal;
    const subscriptionId = state.config.subscriptionId || '';
    const check = () => {
      run.check();
      if (accountKey(state.account) !== run.key || state.msal !== msal ||
        (state.config.subscriptionId || '') !== subscriptionId) throw aborted();
    };
    Object.assign(state, emptySnapshot(), { loading: true, error: '' });
    render();
    try {
      const getToken = createTokenProvider({ msal, account: run.account, check, isInteractionRequired });
      const client = makeClient({ getToken, signal: run.signal, check });
      const snapshot = await collect({ client, subscriptionId, check });
      check();
      if (sessions.canCommit(run, state.account)) Object.assign(state, snapshot);
    } catch (error) {
      if (!isAbort(error) && sessions.canCommit(run, state.account)) state.error = error.message;
    } finally {
      if (sessions.canCommit(run, state.account)) { state.loading = false; render(); }
    }
  }

  return { changeAccount, refresh };
}
