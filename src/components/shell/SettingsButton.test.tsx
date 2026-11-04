import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SettingsButton from './SettingsButton';

const render = (label: string, attention: boolean) =>
  renderToStaticMarkup(<SettingsButton onClick={() => {}} label={label} attention={attention} iconSize={16} className="" />);

describe('SettingsButton (설정 진입점)', () => {
  it('Life Hub needs attention (state C): dot + "(확인 필요)" at the end of the accessible name', () => {
    for (const label of ['설정', '설정 (Ctrl+,)']) {
      const html = render(label, true);
      expect(html).toContain('data-attention');
      expect(html).toContain(`aria-label="${label} (확인 필요)"`);
      expect(html).toMatch(/size-2[^"]*bg-warn|bg-warn[^"]*size-2/);
    }
  });

  it('states A and B: no dot, plain name', () => {
    const html = render('설정', false);
    expect(html).not.toContain('data-attention');
    expect(html).toContain('aria-label="설정"');
    expect(html).not.toContain('확인 필요');
  });
});
