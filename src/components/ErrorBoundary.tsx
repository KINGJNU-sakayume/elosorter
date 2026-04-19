import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  showDetails: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, showDetails: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    const { error, showDetails } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--bg-page)',
        color: 'var(--text-primary)',
        fontFamily: '"DM Sans", sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}>
        <div style={{
          maxWidth: 520,
          width: '100%',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 28,
        }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>⚠</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 10 }}>
            문제가 발생했습니다
          </h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
            앱 렌더링 중 예상치 못한 오류가 났습니다. 대부분의 진행상황은 로컬에 저장돼 있어 새로고침 후 이어할 수 있습니다.
          </p>

          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 20px', borderRadius: 8, border: 'none',
                background: 'var(--accent)', color: '#000',
                fontFamily: '"DM Sans", sans-serif', fontSize: '0.9rem', fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              새로고침
            </button>
            <button
              onClick={() => this.setState({ showDetails: !showDetails })}
              style={{
                padding: '10px 16px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'transparent',
                color: 'var(--text-secondary)',
                fontFamily: '"DM Sans", sans-serif', fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              {showDetails ? '상세 숨기기' : '상세 보기'}
            </button>
          </div>

          {showDetails && (
            <div style={{
              background: 'var(--bg-sub)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 14,
              fontFamily: '"DM Mono", monospace',
              fontSize: '0.78rem',
              color: 'var(--text-secondary)',
              maxHeight: 240,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              <div style={{ color: 'var(--danger)', marginBottom: 6 }}>
                {error.name}: {error.message}
              </div>
              {error.stack && <div style={{ opacity: 0.7 }}>{error.stack}</div>}
            </div>
          )}
        </div>
      </div>
    );
  }
}
