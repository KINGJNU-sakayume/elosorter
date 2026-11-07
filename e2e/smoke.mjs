// 브라우저 E2E (End-to-End, 종단 간) 스모크: Supabase를 걷어 낸 뒤에도 앱이 "이 기기 + Life Hub + JSON 백업 파일"로 동작하는지.
//
// 실행: npx vite build && (npx vite preview --port 4173 &) && node e2e/smoke.mjs
//   - 사전 설치된 Playwright(require('playwright'))를 쓴다. 의존성을 추가하지 않으며 CI(Continuous Integration, 지속적 통합)에는 넣지 않았다.
//   - BASE_URL로 주소를 바꿀 수 있다 (기본 http://localhost:4173/).
// 외부 요청은 모두 가로챈다: 모의 Spotify API, 메모리 안 모의 Life Hub. *.supabase.co로 가는 요청이 하나라도 있으면 실패한다.
// 데이터는 합성(가짜 곡·가짜 사용자·가짜 키)뿐이다.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const HUB = 'https://life-hub-api.213303.workers.dev';
const USER = 'e2e-user';

// ── 합성 데이터 ──────────────────────────────────────────────────────────
const track = (i, tier) => ({
  id: `e2etrack${String(i).padStart(4, '0')}`, name: `Synthetic ${i}`, artists: ['Nobody'], image: '',
  album: 'Synthetic Album', addedAt: '2026-01-01T00:00:00Z', tier, comparisons: 0, durationMs: 180000,
});
const session = (ownerId) => ({
  version: 2, ownerId, source: 'liked', sourceName: null,
  tracks: Array.from({ length: 12 }, (_, i) => track(i, i < 8 ? [1, 2, 3][i % 3] : null)),
  matches: [], compCount: 0, legacySeen: [], lastSyncedAt: null,
  savedAt: '2026-11-01T00:00:00.000Z',
  syncedAt: '2026-10-31T00:00:00.000Z', // P6 5단계 전 버전이 남기던 필드
  syncVersion: null,
});
// 구형 설정: Supabase URL·anon key가 함께 남아 있다 (가짜 값)
const LEGACY_CONFIG = JSON.stringify({ clientId: 'e2e-client', supabaseUrl: 'https://e2e-fake.supabase.co', anonKey: 'fake-anon-key' });

// ── 모의 서버 ────────────────────────────────────────────────────────────
function mockHub() {
  // boardScope: false면 board 권한 전의 연결처럼 보드 업로드에 403 insufficient_scope
  const hub = { doc: null, puts: 0, boards: [], boardScope: false };
  hub.handle = async route => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'Access-Control-Allow-Origin': '*' } });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, PUT' } });
    const meta = d => ({ version: d.version, sha256: d.sha256, size_bytes: d.body.length, written_at: d.writtenAt, device: d.device });
    if (url.pathname === '/elosorter/v1/sync/meta') return hub.doc ? json(200, meta(hub.doc)) : json(404, { error: 'No document yet' });
    if (url.pathname === '/elosorter/v1/sync' && req.method() === 'GET') return hub.doc ? json(200, { ...meta(hub.doc), doc: JSON.parse(hub.doc.body) }) : json(404, { error: 'No document yet' });
    if (url.pathname === '/elosorter/v1/sync' && req.method() === 'PUT') {
      const h = req.headers();
      const base = h['if-none-match'] === '*' ? 0 : Number(String(h['if-match'] ?? '').replace(/"/g, ''));
      if ((hub.doc?.version ?? 0) !== base) return json(412, { error: 'Precondition failed', current: hub.doc ? meta(hub.doc) : null });
      const body = req.postData() ?? '';
      hub.puts++;
      hub.doc = { version: base + 1, body, sha256: createHash('sha256').update(body, 'utf8').digest('hex'), writtenAt: new Date().toISOString(), device: h['x-device-label'] ?? null };
      return json(200, { version: hub.doc.version, sha256: hub.doc.sha256, written_at: hub.doc.writtenAt });
    }
    if (url.pathname === '/elosorter/v1/board' && req.method() === 'PUT') {
      hub.boards.push(req.postData() ?? '');
      if (!hub.boardScope) return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'insufficient_scope' }), headers: { 'Access-Control-Allow-Origin': '*', 'WWW-Authenticate': 'Bearer error="insufficient_scope", scope="elosorter:board"' } });
      return json(200, { ok: true });
    }
    return json(404, { error: 'Not found' });
  };
  return hub;
}

async function newPage(browser, seed, { hub } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
  const supabaseRequests = [];
  const consoleErrors = [];
  await context.route(/supabase\.co/, route => { supabaseRequests.push(route.request().url()); return route.abort(); });
  await context.route('https://api.spotify.com/**', route => {
    const url = new URL(route.request().url());
    const body = url.pathname === '/v1/me' ? { id: USER, display_name: 'E2E', images: [] } : { items: [], next: null, total: 0 };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await context.route(`${HUB}/**`, route => (hub ? hub.handle(route) : route.abort()));
  await context.route(/sdk\.scdn\.co|open\.spotify\.com|i\.scdn\.co|accounts\.spotify\.com/, route => route.abort());
  // 첫 방문에만 저장소를 채운다 (새로고침하면 앱이 남긴 값을 그대로 본다)
  await context.addInitScript(entries => {
    if (sessionStorage.getItem('e2e-seeded')) return;
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    sessionStorage.setItem('e2e-seeded', '1');
  }, seed);
  const page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|net::/.test(m.text())) consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push(String(e)));
  await page.goto(BASE);
  return { context, page, supabaseRequests, consoleErrors };
}

const sidebarStatus = page => page.locator('aside').getByText(/이 기기에 저장됨|Life Hub에 저장됨|저장 대기|저장 중|Life Hub 연결 필요/).first();

function assert(cond, message) {
  if (!cond) throw new Error(`실패: ${message}`);
  console.log(`  ✓ ${message}`);
}

const spotifyTokens = {
  'elo:spotify_access_token': 'fake-access', 'elo:spotify_refresh_token': 'fake-refresh', 'elo:spotify_token_expires': String(Date.now() + 3_600_000),
};
const hubTokens = { 'elo:lifehub.tokens.v1': JSON.stringify({ access_token: 'fake-hub-access', refresh_token: 'fake-hub-refresh', access_expires_at: Date.now() + 3_600_000, scope: 'elosorter:sync' }) };

const browser = await chromium.launch();
const problems = [];
try {
  // ── 1. 로그아웃 + 구형 localStorage(Supabase 설정·syncedAt) ────────────────
  console.log('1. 로그아웃 상태, Supabase 설정이 남은 구형 localStorage');
  {
    const { context, page, supabaseRequests, consoleErrors } = await newPage(browser, { eloConfig: LEGACY_CONFIG, eloState: JSON.stringify(session(null)) });
    await sidebarStatus(page).waitFor();
    assert(await sidebarStatus(page).textContent() === '이 기기에 저장됨', '동기화 꺼짐: "이 기기에 저장됨"');
    const title = await page.locator('aside span[title]').filter({ hasText: '이 기기에 저장됨' }).getAttribute('title');
    assert(/백업 파일/.test(title) && !/supabase|클라우드/i.test(title), '안내 문구: 백업 파일 언급, Supabase 언급 없음');
    const cfg = JSON.parse(await page.evaluate(() => localStorage.getItem('eloConfig')));
    assert(cfg.clientId === 'e2e-client' && !('supabaseUrl' in cfg) && !('anonKey' in cfg), '구형 eloConfig: clientId는 남고 Supabase 값은 지워짐');
    await page.keyboard.press('Control+,');
    await page.getByRole('heading', { name: '설정' }).waitFor();
    assert(await page.locator('#cfg-url, #cfg-key').count() === 0, '설정에 Supabase 입력란 없음');
    assert(!/supabase/i.test(await page.getByRole('dialog', { name: '설정' }).innerText()), '설정 창에 Supabase 문구 없음');
    await page.getByRole('button', { name: '취소' }).click();
    // 로그아웃 상태에서 분류 계속하기
    await page.getByRole('button', { name: /티어/ }).first().click();
    await page.keyboard.press('1');
    await page.waitForTimeout(800); // 로컬 저장 디바운스
    const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('eloState')));
    assert(saved.tracks.filter(t => t.tier != null).length === 9, '로그아웃 상태에서 분류가 이 기기에 저장됨');
    assert(!('syncedAt' in saved), '다시 저장한 세션에 syncedAt 없음');
    // JSON 백업 내려받기
    await page.getByRole('button', { name: /불러오기/ }).first().click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '내려받기' }).click()]);
    const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
    assert(backup.version === 2 && backup.tracks.length === 12, 'JSON 백업 파일 내려받기');
    assert(supabaseRequests.length === 0, 'Supabase 요청 0건');
    if (consoleErrors.length) problems.push(`1: ${consoleErrors.join(' | ')}`);
    await context.close();
  }

  // ── 2. 로그인 + Life Hub 연결: 저장값이 "꺼짐"이어도 동기화는 켜진다 → 지금 동기화 → 연결 해제 ──
  console.log('2. 로그인 + Life Hub 연결, 켜기/끄기 없이 자동으로 켜짐 · 연결 해제');
  {
    const hub = mockHub();
    const { context, page, supabaseRequests, consoleErrors } = await newPage(browser, {
      eloConfig: LEGACY_CONFIG, eloState: JSON.stringify(session(USER)), ...spotifyTokens, ...hubTokens,
      'elo:lifehub.sync.v1': JSON.stringify({ enabled: false, everSucceeded: false, lastSyncAt: null, syncedKey: null, deviceLabel: null, pending: null }),
    }, { hub });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('elo:lifehub.sync.v1') ?? '{}').enabled === true);
    assert(true, '연결 + 로그인 → 저장값 "꺼짐"이 켜짐으로 바뀜');
    // 불러오기 화면에는 상태 한 줄과 「설정」만 있다
    const backup = page.getByRole('region', { name: '백업' });
    assert(await backup.getByRole('button', { name: /동기화|Life Hub 연결|연결 해제/ }).count() === 0, '불러오기 화면에 Life Hub 조작 버튼 없음');
    await backup.getByRole('button', { name: '설정', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '설정' });
    await dialog.getByRole('heading', { name: 'Life Hub', exact: true }).waitFor();
    assert(await dialog.getByRole('button', { name: /동기화 (켜기|끄기)/ }).count() === 0, '동기화 켜기/끄기 버튼 없음');
    await dialog.getByRole('button', { name: '지금 동기화' }).click();
    await page.waitForFunction(() => document.querySelector('aside')?.innerText.includes('Life Hub에 저장됨'));
    assert(hub.puts === 1, '지금 동기화 → Life Hub에 1번 저장');
    assert(JSON.parse(hub.doc.body).tracks.length === 12 && !('syncedAt' in JSON.parse(hub.doc.body)), '올라간 문서: 12곡, syncedAt 없음');
    await dialog.getByText(/^연결됨 · 오늘 \d\d:\d\d 동기화$/).waitFor();
    assert(true, '상태 줄: "연결됨 · 오늘 HH:MM 동기화"');
    // 보드: 동기화로 맞춘 뒤 한 번 올려 보고, board 권한이 없는 옛 연결이라 403 insufficient_scope → 토큰은 그대로, 다시 연결 안내
    await dialog.getByText('보드에 올리려면 Life Hub에 다시 연결해 주세요.', { exact: false }).waitFor();
    assert(hub.boards.length === 1, '보드 목록을 1번 올려 봄');
    const board = JSON.parse(hub.boards[0]);
    assert(board.app === 'elosorter' && board.tiles[0].id === 'ranking' && !hub.boards[0].includes('e2etrack'), '보드 목록: elosorter, 순위 타일, 곡 id·기록 없음');
    assert(await page.evaluate(() => localStorage.getItem('elo:lifehub.tokens.v1') !== null), '보드 권한 부족에도 Life Hub 토큰 유지');
    assert(await dialog.getByRole('button', { name: '지금 동기화' }).isEnabled(), '동기화는 그대로');

    await dialog.getByRole('button', { name: '연결 해제' }).click();
    await page.getByRole('button', { name: '연결 끊기' }).click();
    await dialog.getByRole('button', { name: 'Life Hub 연결' }).waitFor();
    assert(await sidebarStatus(page).textContent() === '이 기기에 저장됨', '연결 해제 → "이 기기에 저장됨"');
    await page.keyboard.press('Control+,');
    await page.getByRole('button', { name: /티어/ }).first().click();
    await page.keyboard.press('2');
    await page.waitForTimeout(17_000); // 자동 업로드 시점(15초)을 넘겨도
    assert(hub.puts === 1, '연결 해제 뒤의 변경은 Life Hub로 보내지 않음');
    assert(supabaseRequests.length === 0, 'Supabase 요청 0건');
    if (consoleErrors.length) problems.push(`2: ${consoleErrors.join(' | ')}`);
    await context.close();
  }

  // ── 3. 동기화는 켜 둔 채 로그아웃 ──────────────────────────────────────────
  console.log('3. 동기화 켜짐 + 로그아웃');
  {
    const hub = mockHub();
    const { context, page, supabaseRequests, consoleErrors } = await newPage(browser, {
      eloConfig: LEGACY_CONFIG, eloState: JSON.stringify(session(USER)), ...hubTokens,
      'elo:lifehub.sync.v1': JSON.stringify({ enabled: true, everSucceeded: true, lastSyncAt: null, syncedKey: null, deviceLabel: null, pending: null }),
    }, { hub });
    await sidebarStatus(page).waitFor();
    assert(await sidebarStatus(page).textContent() === '이 기기에 저장됨', '로그아웃: "이 기기에 저장됨"');
    const title = await page.locator('aside span[title]').filter({ hasText: '이 기기에 저장됨' }).getAttribute('title');
    assert(/로그인/.test(title), '안내 문구: 로그인하면 이어서 동기화');
    await page.waitForTimeout(1500);
    assert(hub.puts === 0, '로그아웃 상태에서는 Life Hub로 보내지 않음');
    assert(supabaseRequests.length === 0, 'Supabase 요청 0건');
    if (consoleErrors.length) problems.push(`3: ${consoleErrors.join(' | ')}`);
    await context.close();
  }
} finally {
  await browser.close();
}
if (problems.length) {
  console.error(`콘솔 오류:\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('E2E 통과');
