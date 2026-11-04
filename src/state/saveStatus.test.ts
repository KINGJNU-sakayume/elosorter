import { describe, expect, it } from 'vitest';
import { primaryStatus, shouldEnableSync } from './saveStatus';

describe('primaryStatus (what the sidebar shows)', () => {
  it('sync off → this device (and the JSON backup file) only, whatever else is true', () => {
    expect(primaryStatus({ enabled: false, connected: false, status: 'off' }, false)).toBe('off');
    expect(primaryStatus({ enabled: false, connected: true, status: 'off' }, true)).toBe('off');
  });

  it('sync on → the Life Hub status', () => {
    expect(primaryStatus({ enabled: true, connected: true, status: 'idle' }, true)).toBe('idle');
    expect(primaryStatus({ enabled: true, connected: true, status: 'conflict' }, true)).toBe('conflict');
    expect(primaryStatus({ enabled: true, connected: true, status: 'retry' }, true)).toBe('retry');
  });

  it('sync on but logged out → signed_out (nothing is sent)', () => {
    expect(primaryStatus({ enabled: true, connected: true, status: 'idle' }, false)).toBe('signed_out');
  });

  it('sync on but the connection is gone → disconnected', () => {
    expect(primaryStatus({ enabled: true, connected: false, status: 'idle' }, true)).toBe('disconnected');
    expect(primaryStatus({ enabled: true, connected: false, status: 'idle' }, false)).toBe('disconnected');
  });
});

describe('shouldEnableSync (no on/off switch)', () => {
  it('connected + logged in → sync turns on even if the stored value says off', () => {
    expect(shouldEnableSync({ connected: true, enabled: false }, true)).toBe(true);
  });
  it('already on, not connected, or logged out → nothing to do', () => {
    expect(shouldEnableSync({ connected: true, enabled: true }, true)).toBe(false);
    expect(shouldEnableSync({ connected: false, enabled: false }, true)).toBe(false);
    expect(shouldEnableSync({ connected: true, enabled: false }, false)).toBe(false);
  });
});
