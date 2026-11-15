import { accountKey, aborted, emptySnapshot, isAbort, SnapshotSession } from './snapshot.js';
import { createTokenProvider } from './auth.js';
import { createApiClient } from './api.js';
import { collectTenant } from './collect.js';

export function createDashboardController({ state, render, isInteractionRequired, collect = collectTenant,
  makeClient = createApiClient, refreshTimeoutMs = 120000 }) {
  const sessions = new SnapshotSession();

  function changeAccount(account, syncMsal = true) {
    const changed = accountKey(state.account) !== accountKey(account);
    if (changed || !account) {
      sessions.cancel();
      Object.assign(state, emptySnapshot(), { loading: false, loadStage: '', loadProgress: {}, error: '', search: '' });
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
    Object.assign(state, emptySnapshot(), { loading: true, loadStage: 'Requesting Microsoft access tokens…', loadProgress: {}, error: '' });
    render();
    let timer;
    try {
      const getToken = createTokenProvider({ msal, account: run.account, check, isInteractionRequired });
      const client = makeClient({ getToken, signal: run.signal, check,
        onRequest: () => {
          if (sessions.canCommit(run, state.account) && state.loadStage !== 'Querying Microsoft Graph and Azure Resource Manager…') {
            state.loadStage = 'Querying Microsoft Graph and Azure Resource Manager…';
            render();
          }
        },
      });
      const collected = collect({ client, subscriptionId, check, onProgress: ({ key, status, detail, phase }) => {
        if (!sessions.canCommit(run, state.account)) return;
        if (phase) {
          state.loadStage = phase;
          render();
          return;
        }
        state.loadProgress = { ...state.loadProgress, [key]: { status, detail } };
        const entries = Object.entries(state.loadProgress);
        const completed = entries.filter(([, value]) => !['running', 'authorizing'].includes(value.status)).length;
        const running = entries.filter(([, value]) => ['running', 'authorizing'].includes(value.status)).map(([name]) => name);
        state.loadStage = `${completed} datasets processed • ${running.length ? 'Working on: ' + running.slice(0, 3).join(', ') : 'Preparing next stage'}`;
        render();
      } });
      // A single pending MSAL or Graph operation must never hold the page indefinitely.
      // The underlying session is cancelled when the deadline is reached.
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(
          'Tenant refresh exceeded the two-minute safety limit. Microsoft token acquisition or a data request may be stalled. Retry the refresh; if it repeats, check DevTools Console and Network with the filters cleared.'
        )), refreshTimeoutMs);
      });
      const snapshot = await Promise.race([collected, deadline]);
      check();
      if (sessions.canCommit(run, state.account)) {
        state.loadStage = 'Rendering governance dashboard…';
        Object.assign(state, snapshot);
      }
    } catch (error) {
      if (!isAbort(error) && sessions.canCommit(run, state.account)) state.error = error.message;
    } finally {
      clearTimeout(timer);
      if (sessions.canCommit(run, state.account)) {
        state.loading = false;
        state.loadStage = '';
        render();
        run.controller.abort();
      }
    }
  }

  return { changeAccount, refresh };
}
