import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ThemeContext, initialTheme, type Theme } from './context';

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'light' ? '#ffffff' : '#1c1c1e');
    // 같은 github.io 주소의 다른 앱(Diaryroulette 등)과 겹치지 않게 앱 이름을 붙인 키. index.html과 같아야 한다.
    try { localStorage.setItem('elo:theme', theme); } catch { /* 무시 */ }
  }, [theme]);

  const toggle = useCallback(() => setTheme(t => (t === 'dark' ? 'light' : 'dark')), []);
  const value = useMemo(() => ({ theme, toggle, setTheme }), [theme, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
