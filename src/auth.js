import { aborted, accountKey } from './snapshot.js';

// Deduplicate simultaneous silent requests and serialize interactive consent.
// The account captured at refresh start is used for every request.
export function createTokenProvider({ msal, account, check, isInteractionRequired }) {
  const pending = new Map();
  let interaction = Promise.resolve();

  return function getToken(scopes, { forceRefresh = false } = {}) {
    check();
    const key = [...scopes].sort().join(' ') + (forceRefresh ? ':refresh' : '');
    if (pending.has(key)) return pending.get(key);
    const request = { scopes, account, forceRefresh };
    const task = (async () => {
      let result;
      try {
        result = await msal.acquireTokenSilent(request);
      } catch (error) {
        check();
        if (!isInteractionRequired(error)) throw error;
        const popup = interaction.catch(() => {}).then(async () => {
          check();
          return msal.acquireTokenPopup(request);
        });
        interaction = popup;
        result = await popup;
      }
      check();
      if (!result.account || accountKey(result.account) !== accountKey(account)) throw aborted();
      if (typeof result.accessToken !== 'string' || !result.accessToken) throw new Error('MSAL returned no usable access token.');
      return result.accessToken;
    })();
    pending.set(key, task);
    // Avoid a rejected, unobserved promise from finally().
    task.then(() => pending.delete(key), () => pending.delete(key));
    return task;
  };
}
