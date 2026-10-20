import test from 'node:test';
import assert from 'node:assert/strict';
import { assessment, emptySnapshot, SnapshotSession } from '../src/snapshot.js';
import { createTokenProvider } from '../src/auth.js';

const account = { homeAccountId: 'person', tenantId: 'tenant-a' };
const complete = () => Object.fromEntries(Object.keys(emptySnapshot().coverage).map(key => [key, { status: 'available' }]));

test('unavailable, partial, pending and skipped evidence withhold the score', () => {
  for (const status of ['unavailable', 'partial', 'pending', 'skipped']) {
    const coverage = complete(); coverage.mfa = { status };
    assert.equal(assessment(coverage).score, null);
    assert.equal(assessment(coverage).missing[0].key, 'mfa');
  }
  assert.equal(assessment({}).score, null);
  assert.equal(assessment(complete()).score, 100);
  assert.equal(assessment(complete(), [{ severity: 'high' }]).score, 88);
});

test('logout and replacement refresh invalidate old snapshots', () => {
  const sessions = new SnapshotSession(); const first = sessions.begin(account);
  sessions.cancel();
  assert.equal(first.signal.aborted, true);
  assert.throws(first.check, { name: 'AbortError' });
  assert.equal(sessions.canCommit(first, account), false);
  const second = sessions.begin(account); const third = sessions.begin(account);
  assert.equal(sessions.canCommit(second, account), false);
  assert.equal(sessions.canCommit(third, account), true);
  assert.equal(sessions.canCommit(third, { ...account, tenantId: 'tenant-b' }), false);
});

test('logout while a token request is pending prevents further consent', async () => {
  const sessions = new SnapshotSession(); const run = sessions.begin(account);
  let rejectToken; let popups = 0;
  const getToken = createTokenProvider({ account, check: run.check, isInteractionRequired: () => true,
    msal: { acquireTokenSilent: () => new Promise((_, reject) => { rejectToken = reject; }),
      acquireTokenPopup: () => { popups++; } } });
  const token = getToken(['User.Read']); sessions.cancel(); rejectToken(new Error('consent'));
  await assert.rejects(token, { name: 'AbortError' }); assert.equal(popups, 0);
});

test('a token returned for another tenant is never used', async () => {
  const sessions = new SnapshotSession(); const run = sessions.begin(account);
  const getToken = createTokenProvider({ account, check: run.check, isInteractionRequired: () => false,
    msal: { acquireTokenSilent: async () => ({ accessToken: 'wrong', account: { ...account, tenantId: 'tenant-b' } }) } });
  await assert.rejects(getToken(['User.Read']), { name: 'AbortError' });
});

test('a successful token response arriving after logout is discarded', async () => {
  const sessions = new SnapshotSession(); const run = sessions.begin(account); let resolveToken;
  const getToken = createTokenProvider({ account, check: run.check, isInteractionRequired: () => false,
    msal: { acquireTokenSilent: () => new Promise(resolve => { resolveToken = resolve; }) } });
  const request = getToken(['User.Read']); sessions.cancel(); resolveToken({ accessToken: 'late', account });
  await assert.rejects(request, { name: 'AbortError' });
});
