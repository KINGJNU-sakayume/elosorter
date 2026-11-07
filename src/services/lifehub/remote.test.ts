import { describe, expect, it } from 'vitest';
import callbackHtml from '../../../public/lifehub/index.html?raw';
import clientJson from '../../../public/lifehub-client.json?raw';
import viteConfig from '../../../vite.config.ts?raw';
import {
  APP_URL, beginConnect, CALLBACK_KEY, CALLBACK_URL, CLIENT_ID, completeStoredCallback, connectAvailable, connectedAt, disconnect,
  grantedScopes, isConnected, LIFEHUB_ORIGIN, LifeHubError, mayHaveSyncScope, RESOURCE, SYNC_SCOPE, syncRequest,
} from './remote';
import { connected, FakeHub, makeDeps, sha256OfText } from './testing';

const fromHex = (h: string) => Uint8Array.from(h.match(/../g)!, x => parseInt(x, 16));
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const expectKind = async (p: Promise<unknown>, kind: string) => {
  const err = await p.then(() => null, e => e as LifeHubError);
  expect(err).toBeInstanceOf(LifeHubError);
  expect(err!.kind).toBe(kind);
};

describe('deployment files', () => {
  it('lifehub-client.json matches the constants and the Vite base', () => {
    const doc = JSON.parse(clientJson);
    expect(doc.client_id).toBe(CLIENT_ID);
    expect(CLIENT_ID).toBe('https://kingjnu-sakayume.github.io/elosorter/lifehub-client.json');
    expect(doc.redirect_uris).toEqual([CALLBACK_URL]);
    expect(CALLBACK_URL).toBe('https://kingjnu-sakayume.github.io/elosorter/lifehub/');
    expect(doc.token_endpoint_auth_method).toBe('none');
    expect(doc.grant_types).toEqual(['authorization_code', 'refresh_token']);
    // GitHub Pages 아래 경로는 vite.config.ts의 base('/elosorter/')와 같다
    expect(new URL(APP_URL).pathname).toBe('/elosorter/');
    expect(viteConfig).toContain("'/elosorter/'");
  });

  it('the callback page hands the result to sessionStorage under the key the app reads', () => {
    const html = callbackHtml;
    expect(html).toContain(`sessionStorage.setItem('${CALLBACK_KEY}', location.search)`);
    expect(html).toContain("location.replace(new URL('../', location.href).href)");
    expect(html).toContain('no-referrer');
  });

  it('asks for the one required scope and the Hub resource', () => {
    expect(SYNC_SCOPE).toBe('elosorter:sync');
    expect(RESOURCE).toBe(`${LIFEHUB_ORIGIN}/elosorter`);
  });
});

describe('connect (OAuth + PKCE)', () => {
  it('builds an S256 PKCE authorization request without putting the verifier in the URL', async () => {
    const hub = new FakeHub();
    const deps = makeDeps(hub);
    const url = new URL(await beginConnect(deps));
    expect(url.origin + url.pathname).toBe(`${LIFEHUB_ORIGIN}/authorize`);
    const q = url.searchParams;
    expect(q.get('response_type')).toBe('code');
    expect(q.get('client_id')).toBe(CLIENT_ID);
    expect(q.get('redirect_uri')).toBe(CALLBACK_URL);
    expect(q.get('scope')).toBe('elosorter:sync elosorter:board');
    expect(q.get('resource')).toBe(RESOURCE);
    expect(q.get('code_challenge_method')).toBe('S256');
    const pending = JSON.parse(deps.session.getItem('elo:lifehub.pending-auth.v1')!);
    expect(q.get('state')).toBe(pending.state);
    expect(q.get('code_challenge')).toBe(b64url(fromHex(await sha256OfText(pending.verifier))));
    expect(url.href).not.toContain(pending.verifier);
    // 검증값은 이 탭의 sessionStorage에만 있다
    expect(deps.storage.dump()).toEqual({});
  });

  it('completes the callback: exchanges the code with the verifier and stores tokens apart from Spotify', async () => {
    const hub = new FakeHub();
    const deps = makeDeps(hub);
    const url = new URL(await beginConnect(deps));
    const state = url.searchParams.get('state')!;
    deps.storage.setItem('elo:spotify_access_token', 'spotify-token');
    deps.session.setItem(CALLBACK_KEY, `?code=abc123&state=${state}&iss=${encodeURIComponent(LIFEHUB_ORIGIN)}`);

    expect(await completeStoredCallback(deps)).toBe(true);
    const body = hub.tokenRequests[0];
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('abc123');
    expect(body.get('client_id')).toBe(CLIENT_ID);
    expect(body.get('redirect_uri')).toBe(CALLBACK_URL);
    expect(body.get('resource')).toBe(RESOURCE);
    // PKCE: 보낸 검증값의 SHA-256이 처음 보낸 challenge와 같다
    const challenge = url.searchParams.get('code_challenge')!;
    const verifierHash = b64url(fromHex(await sha256OfText(body.get('code_verifier')!)));
    expect(verifierHash).toBe(challenge);

    expect(isConnected(deps)).toBe(true);
    expect(grantedScopes(deps)).toEqual(['elosorter:sync']);
    expect(deps.storage.getItem('elo:lifehub.tokens.v1')).not.toBeNull();
    expect(deps.storage.getItem('elo:spotify_access_token')).toBe('spotify-token'); // Spotify 토큰은 그대로
    expect(connectedAt(deps)).toBe(deps.now()); // 보드 업로드의 권한 부족 멈춤을 풀 기준
    // 일회용: 결과와 대기 정보가 지워졌다
    expect(deps.session.getItem(CALLBACK_KEY)).toBeNull();
    expect(deps.session.getItem('elo:lifehub.pending-auth.v1')).toBeNull();
    expect(await completeStoredCallback(deps)).toBe(false);
  });

  it('refuses a callback whose state does not match, and does not exchange the code', async () => {
    const hub = new FakeHub();
    const deps = makeDeps(hub);
    await beginConnect(deps);
    deps.session.setItem(CALLBACK_KEY, '?code=abc&state=forged');
    await expectKind(completeStoredCallback(deps), 'state');
    expect(hub.tokenRequests).toHaveLength(0);
    expect(isConnected(deps)).toBe(false);
    expect(deps.session.getItem('elo:lifehub.pending-auth.v1')).toBeNull(); // 한 번 시도하면 버려진다
  });

  it('refuses an expired request (older than 10 minutes)', async () => {
    const hub = new FakeHub();
    const deps = makeDeps(hub);
    const state = new URL(await beginConnect(deps)).searchParams.get('state')!;
    deps.clock.t += 10 * 60 * 1000 + 1;
    deps.session.setItem(CALLBACK_KEY, `?code=abc&state=${state}`);
    await expectKind(completeStoredCallback(deps), 'state');
    expect(hub.tokenRequests).toHaveLength(0);
  });

  it('refuses a callback that this browser did not start (no pending request)', async () => {
    const deps = makeDeps(new FakeHub());
    deps.session.setItem(CALLBACK_KEY, '?code=abc&state=anything');
    await expectKind(completeStoredCallback(deps), 'state');
  });

  it('refuses a response from another issuer and reports a denied consent', async () => {
    const hub = new FakeHub();
    const deps = makeDeps(hub);
    let state = new URL(await beginConnect(deps)).searchParams.get('state')!;
    deps.session.setItem(CALLBACK_KEY, `?code=abc&state=${state}&iss=${encodeURIComponent('https://evil.example')}`);
    await expectKind(completeStoredCallback(deps), 'state');
    state = new URL(await beginConnect(deps)).searchParams.get('state')!;
    deps.session.setItem(CALLBACK_KEY, `?error=access_denied&state=${state}`);
    await expectKind(completeStoredCallback(deps), 'denied');
    expect(hub.tokenRequests).toHaveLength(0);
  });

  it('is only available on the deployed address (client_id and redirect are tied to it)', () => {
    expect(connectAvailable({ origin: 'https://kingjnu-sakayume.github.io', pathname: '/elosorter/' })).toBe(true);
    expect(connectAvailable({ origin: 'https://kingjnu-sakayume.github.io', pathname: '/animan/' })).toBe(false);
    expect(connectAvailable({ origin: 'http://127.0.0.1:5173', pathname: '/' })).toBe(false);
  });
});

describe('syncRequest', () => {
  it('refreshes the token once on 401 and retries', async () => {
    const hub = new FakeHub();
    const deps = makeDeps(hub);
    connected(deps, hub);
    // 만료 직전 토큰: 서버가 모르는 access token
    deps.storage.setItem('elo:lifehub.tokens.v1', JSON.stringify({ access_token: 'stale', refresh_token: 'rt-pre', access_expires_at: deps.now() + 3_600_000, scope: SYNC_SCOPE }));
    const response = await syncRequest(deps, 'GET', '/meta');
    expect(response.status).toBe(404); // 인증은 통과했고 문서가 아직 없다
    expect(hub.tokenRequests.map(r => r.get('grant_type'))).toEqual(['refresh_token']);
    expect(hub.log.map(r => r.headers.authorization === 'Bearer stale')).toEqual([true, false]);
  });

  it('403 insufficient_scope = no permission; the token is kept', async () => {
    const hub = new FakeHub();
    hub.access = 'inbox-only';
    const deps = makeDeps(hub);
    connected(deps, hub);
    await expectKind(syncRequest(deps, 'GET', '/meta'), 'no_sync_scope');
    expect(isConnected(deps)).toBe(true);
  });

  it('any other 403 means the grant is unusable: the token is dropped', async () => {
    const hub = new FakeHub();
    hub.access = 'revoked';
    const deps = makeDeps(hub);
    connected(deps, hub);
    await expectKind(syncRequest(deps, 'GET', '/meta'), 'not_connected');
    expect(isConnected(deps)).toBe(false);
  });

  it('network failures are reported as such, without leaking details', async () => {
    const hub = new FakeHub();
    const deps = makeDeps(hub);
    connected(deps, hub);
    hub.inject({ method: 'GET', kind: 'drop' });
    const err = await syncRequest(deps, 'GET', '/meta').catch(e => e as LifeHubError);
    expect(err).toBeInstanceOf(LifeHubError);
    expect((err as LifeHubError).kind).toBe('network');
    expect((err as LifeHubError).message).not.toMatch(/Bearer|at-|rt-/);
  });
});

describe('tokens', () => {
  it('knows when the stored token lacks the sync scope', () => {
    const hub = new FakeHub();
    const deps = makeDeps(hub);
    connected(deps, hub, 'something:else');
    expect(mayHaveSyncScope(deps)).toBe(false);
    connected(deps, hub, SYNC_SCOPE);
    expect(mayHaveSyncScope(deps)).toBe(true);
  });

  it('disconnect removes the tokens and asks the server to revoke the refresh token', async () => {
    const hub = new FakeHub();
    const deps = makeDeps(hub);
    connected(deps, hub);
    disconnect(deps);
    expect(isConnected(deps)).toBe(false);
    await Promise.resolve();
    const revoke = hub.tokenRequests.at(-1)!;
    expect(revoke.get('token')).toBe('rt-pre');
    expect(revoke.get('token_type_hint')).toBe('refresh_token');
  });
});
