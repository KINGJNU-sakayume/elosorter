import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SessionData } from '../core/session/schema';
import type { HubSnapshot, HubStatus } from '../services/lifehub/engine';
import type { AppState } from '../state/reducer';
import { AppStateContext } from '../state/context';
import { LifeHubPanel, LifeHubStatusLine } from './LifeHubSync';
import { lifeHubView } from './lifeHubView';

const session: SessionData = {
  version: 2, ownerId: 'me', source: 'liked', sourceName: null, tracks: [], matches: [], compCount: 0,
  legacySeen: [], lastSyncedAt: null, savedAt: null, syncVersion: 3,
};

const snapshot = (over: Partial<HubSnapshot> = {}): HubSnapshot => ({
  status: 'idle', enabled: true, connected: true, everSucceeded: true, lastSyncAt: null, remote: null, conflict: null,
  detail: null, deviceLabel: null, effectiveLabel: 'Chrome · Linux', ...over,
});

const noop = () => {};

function panel(snap: HubSnapshot, { loggedIn = true, connectAvailable = true } = {}) {
  const view = lifeHubView({ snap, loggedIn, unsaved: 0 });
  return renderToStaticMarkup(
    <AppStateContext.Provider value={{ session } as AppState}>
      <LifeHubPanel
        view={view} snap={snap} session={session} loggedIn={loggedIn} connectAvailable={connectAvailable} replaced={false} busy={null}
        onConnect={noop} onDisconnect={noop} onSync={noop} onLoadCloud={noop} onOverwrite={noop}
        onDeviceLabel={noop} onDownloadReplaced={noop} onClearReplaced={noop}
      />
    </AppStateContext.Provider>,
  );
}

const buttons = (html: string) => [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map(m => m[1].replace(/<[^>]+>/g, ''));

/** src 아래 모든 .tsx (테스트 제외)의 원문 */
const RAW = import.meta.glob<string>(['/src/**/*.tsx', '!/src/**/*.test.tsx'], { query: '?raw', import: 'default', eager: true });
const sources = () => Object.entries(RAW).map(([path, text]) => ({ path: path.replace(/^\/src\//, ''), text }));

const OFF = snapshot({ status: 'off', enabled: false, connected: false });

describe('Life Hub section (settings)', () => {
  it('section title is exactly "Life Hub"', () => {
    expect(panel(OFF)).toMatch(/<h3[^>]*>Life Hub<\/h3>/);
  });

  it('A: description + "Life Hub 연결"; disabled with a hint off the deployed address', () => {
    const html = panel(OFF);
    expect(html).toContain('이 앱의 세션을 다른 기기와 맞춥니다.');
    expect(buttons(html)).toEqual(['Life Hub 연결']);
    const off = panel(OFF, { connectAvailable: false });
    expect(off).toMatch(/<button[^>]*disabled[^>]*>.*Life Hub 연결/);
    expect(off).toContain('배포된 주소에서만 연결할 수 있어요.');
  });

  it('before connecting, "Life Hub 연결" exists only in the settings section', () => {
    const line = renderToStaticMarkup(<LifeHubStatusLine view={lifeHubView({ snap: OFF, loggedIn: true, unsaved: 0 })} onOpenSettings={noop} />);
    expect(line.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).toBe('Life Hub 연결 안 됨 · 설정');
    expect(buttons(line)).toEqual(['설정']);
    expect(sources().length).toBeGreaterThan(20);
    const owners = sources().filter(f => />\s*Life Hub 연결\s*</.test(f.text)).map(f => f.path);
    expect(owners).toEqual(['components/LifeHubSync.tsx']);
  });

  it('no sync on/off control anywhere', () => {
    for (const s of [snapshot(), snapshot({ status: 'off', enabled: false }), OFF, snapshot({ status: 'conflict', conflict: { version: 4, writtenAt: '2026-11-01T00:00:00Z', device: null, sizeBytes: null, summary: null } })]) {
      const html = panel(s);
      expect(html).not.toMatch(/동기화 (켜기|끄기)/);
    }
    expect(sources().filter(f => /동기화 (켜기|끄기)/.test(f.text)).map(f => f.path)).toEqual([]);
  });

  it('B: status line, "지금 동기화" + "연결 해제", collapsed 고급 with server version', () => {
    const html = panel(snapshot());
    expect(html).toContain('연결됨 · 아직 동기화 전');
    expect(buttons(html)).toEqual(['지금 동기화', '연결 해제']);
    expect(html).toMatch(/<details[^>]*><summary[^>]*>고급<\/summary>/);
    expect(html).not.toMatch(/<details[^>]*open/);
    expect(html).toContain('서버 버전 3');
    expect(html).toContain('id="hub-device"');
  });

  it('connected but signed out: guidance line, no warning dot', () => {
    const html = panel(snapshot({ status: 'off', enabled: false }), { loggedIn: false });
    expect(html).toContain('연결됨 · Spotify에 로그인하면 동기화됩니다');
    expect(html).not.toContain('bg-warn');
    expect(html).not.toContain('확인 필요');
  });

  it('C: disconnected / no permission → 다시 연결 + 연결 해제', () => {
    const lost = panel(snapshot({ status: 'off', connected: false }));
    expect(lost).toContain('확인 필요');
    expect(lost).toContain('Life Hub 연결이 끊겼습니다. 다시 연결해 주세요. 이 기기의 기록은 그대로입니다.');
    expect(buttons(lost)).toEqual(['다시 연결', '연결 해제']);
    const forbidden = panel(snapshot({ status: 'forbidden', detail: 'x' }));
    expect(forbidden).toContain('동기화 권한이 없는 연결입니다. 한 번 다시 연결하면 제안과 동기화가 함께 켜집니다.');
    expect(buttons(forbidden).slice(0, 2)).toEqual(['다시 연결', '연결 해제']);
  });

  it('C: conflict keeps the choice buttons, worded with "Life Hub", never "클라우드"', () => {
    const html = panel(snapshot({ status: 'conflict', conflict: { version: 4, writtenAt: '2026-11-01T00:00:00Z', device: 'Phone', sizeBytes: null, summary: null } }));
    expect(buttons(html).slice(0, 4)).toEqual(['Life Hub 버전 쓰기', '이 기기 버전으로 덮어쓰기', '이 기기 세션 내려받기', '연결 해제']);
    expect(html).not.toContain('클라우드');
  });

  it('C: error offers 지금 동기화; too large / other account show the existing text only', () => {
    const statuses: [HubStatus, string[]][] = [['error', ['지금 동기화', '연결 해제']], ['too_large', ['연결 해제']], ['blocked', ['연결 해제']]];
    for (const [status, expected] of statuses) {
      const html = panel(snapshot({ status, detail: `detail-${status}` }));
      expect(html).toContain(`detail-${status}`);
      expect(buttons(html)).toEqual(expected);
    }
  });

  it('no screen text in src says "클라우드"', () => {
    const offenders = sources().filter(f => /['">][^'"<>]*클라우드[^'"<>]*['"<]/.test(f.text.replace(/\/\/.*$|\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}/gm, ''))).map(f => f.path);
    expect(offenders).toEqual([]);
  });
});
