import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
  showDetails: boolean;
}

function downloadRawSession() {
  const raw = localStorage.getItem('eloState');
  if (!raw) return;
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'elo-sorter-recovery.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** 렌더링 오류가 나도 저장된 진행 상황을 잃지 않도록 새로고침·원본 데이터 내려받기를 제공한다 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, showDetails: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    const { error, showDetails } = this.state;
    if (!error) return this.props.children;
    const hasData = (() => {
      try { return !!localStorage.getItem('eloState'); } catch { return false; }
    })();

    return (
      <div className="flex min-h-dvh items-center justify-center bg-page p-6 text-fg">
        <div className="w-full max-w-lg rounded-2xl bg-section p-7">
          <h1 className="text-xl font-bold tracking-tight">문제가 발생했습니다</h1>
          <p className="mt-2 text-sm leading-relaxed text-fg-2">
            화면을 그리는 중 예상치 못한 오류가 났습니다. 진행 상황은 브라우저에 저장돼 있으니 새로고침하면 대부분 이어서 할 수 있습니다.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={() => window.location.reload()}
              className="h-10 rounded-[10px] bg-accent-fill px-4 text-sm font-semibold text-accent-fg">
              새로고침
            </button>
            {hasData && (
              <button type="button" onClick={downloadRawSession}
                className="h-10 rounded-[10px] bg-sub px-4 text-sm font-semibold hover:bg-sub-strong">
                저장 데이터 내려받기
              </button>
            )}
            <button type="button" onClick={() => this.setState({ showDetails: !showDetails })}
              className="h-10 rounded-[10px] px-3 text-sm font-semibold text-accent hover:bg-sub">
              {showDetails ? '상세 숨기기' : '상세 보기'}
            </button>
          </div>
          {showDetails && (
            <pre className="mt-4 max-h-60 overflow-auto rounded-[10px] bg-sub p-3 font-mono text-xs break-words whitespace-pre-wrap text-fg-2">
              <span className="text-danger">{error.name}: {error.message}</span>
              {error.stack && `\n\n${error.stack}`}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
