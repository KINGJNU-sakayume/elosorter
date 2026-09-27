# ELO Sorter

Spotify 좋아요 곡·플레이리스트를 **티어 분류 → 1:1 비교**로 정렬해 나만의 음악 순위를 만드는 개인용 웹앱.
홈 화면 설치는 되지만 Service Worker는 쓰지 않으므로 오프라인에서는 열리지 않습니다.

> 설계 근거와 v1 대비 변경점, 시뮬레이션 결과는 [docs/ANALYSIS.md](docs/ANALYSIS.md)에 정리돼 있습니다.

## 사용 흐름

1. **Spotify 로그인** (PKCE OAuth)
2. **불러오기** — 좋아요 곡 또는 플레이리스트. 이미 진행 중인 소스를 다시 불러오면 기록을 지우지 않고 동기화합니다.
3. **티어 분류** — 곡마다 직감으로 Tier 1(최애)·2(선호)·3(보통). 권장 비율(10/40/50)은 가이드일 뿐이며, 실제로 나눈 비율에 맞춰 시작 점수가 자동으로 조정됩니다. 곡에 1초 머물면 자동 재생되고, 빠르게 넘기는 동안에는 재생 요청을 보내지 않습니다.
4. **비교 정렬** — 두 곡 중 더 좋은 쪽을 5단계로 고릅니다. 레이팅이 가까운 곡끼리, 티어 경계를 넘어서도 비교합니다. "상위권 집중"을 켜면 Top 10을 먼저 확정합니다.
5. **랭킹** — 예상 정확도, 곡별 불확실성(±), 검색·필터, 티어 변경, CSV 내보내기.
6. **동기화·백업** — Spotify에서 추가·삭제된 곡 반영, Supabase 자동 백업, JSON 백업 파일.

로그인하지 않아도 이 브라우저에 저장된 세션으로 비교·랭킹은 계속할 수 있습니다(재생만 불가).

## 키보드 단축키

| 키 | 동작 | 화면 |
|---|---|---|
| `1` / `2` / `3` | Tier 1 / 2 / 3으로 분류 | 티어 분류 |
| `Space` | 재생 / 일시정지 | 티어 분류 · 비교 |
| `1` · `←` | A 확실히 | 비교 |
| `2` | A 조금 더 | 비교 |
| `3` · `↓` | 비슷함 | 비교 |
| `4` | B 조금 더 | 비교 |
| `5` · `→` | B 확실히 | 비교 |
| `A` / `B` | A 곡 / B 곡 재생 | 비교 |
| `S` | 건너뛰기 (기록하지 않음) | 비교 |
| `Z` | 되돌리기 | 티어 분류 · 비교 |
| `Ctrl` + `,` *(Mac: `⌘` + `,`)* | 설정 열기/닫기 | 전체 |

앨범 아트를 클릭해도 그 곡을 "확실히"로 고릅니다. 키를 누르고 있어도 반복 입력되지 않으며, 입력창·설정 창이 열려 있을 때는 단축키가 동작하지 않습니다.

## 알고리즘 요약

- **모델**: 베이지안 Bradley–Terry. `P(a가 b보다 좋다) = σ(θa − θb)`, 각 곡의 θ는 티어에서 온 정규 사전분포를 가집니다. 비교가 추가·삭제될 때마다 전체 비교 기록으로 사후 최빈값(MAP)을 다시 계산합니다 → 비교 순서와 무관하고, 되돌리기가 정확합니다.
- **표시 척도**: Elo와 같은 척도(1500 중심, 400점 차 = 오즈 10배). 레이팅 옆 `±`는 사후 표준편차입니다.
- **티어 사전분포**: 실제 분류 비율과 "직감 잡음"(τ = 0.5)을 반영한 절단정규 모델. 권장 비율로 나누면 약 1814 / 1600 / 1357.
- **다음 쌍**: 불확실성이 가장 큰 곡을 고르고, 레이팅이 가까운 곡 중 결과를 가장 예측하기 어려운 곡과 짝짓습니다.
- **예상 정확도**: 임의의 두 곡의 현재 순서가 맞을 확률의 추정치(50% = 무작위, 100% = 확정). 시뮬레이션에서 실제 정확도를 1~2%p 안에서 따라갑니다.

## 설정

### 환경 변수

빌드 시 세 가지 값이 필요합니다. 설정 창(헤더의 ⚙ 또는 `Ctrl+,`)에서 입력한 값은 이 브라우저에만 저장되며 환경 변수보다 우선합니다.

| 변수명 | 설명 |
|---|---|
| `VITE_SPOTIFY_CLIENT_ID` | Spotify 앱 Client ID (Redirect URI 화이트리스트로 보호) |
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL (선택) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (선택) |

Supabase를 비워 두면 세션은 브라우저(localStorage)와 백업 파일로만 보관됩니다.

### Supabase 테이블

```sql
create table elo_state (
  id text primary key,            -- Spotify user id
  data jsonb not null,            -- 세션 (저장 형식 v2 + 요약)
  updated_at timestamptz not null default now()
);
alter table elo_state enable row level security;
create policy "anon read/write" on elo_state for all to anon using (true) with check (true);
```

### Supabase 관련 주의

이 앱은 **한 Supabase 프로젝트당 한 사용자** 를 가정합니다. 세션은 Spotify user ID를 primary key로 `elo_state` 테이블에 저장되므로, 동일 Spotify 계정의 여러 기기 간에는 세션이 공유됩니다.

현재 구현은 Supabase Auth를 **사용하지 않고** anon key로 직접 테이블을 읽고 씁니다. RLS는 anon 역할에 대해 "모두 허용" 또는 "모두 금지"의 이진 결정만 가능하며, `auth.uid()` 같은 사용자별 격리는 불가능합니다. 따라서:

- 배포 URL과 anon key를 아는 사람은 RLS가 anon에 허용한 작업(이 앱에선 `elo_state`에 대한 CRUD)을 수행할 수 있습니다. **신뢰하지 않는 사람에게 노출하지 마십시오**.
- 여러 사용자가 같은 Supabase 프로젝트를 공유하면 서로의 행을 덮어쓸 수 있습니다.
- 진짜 다중 사용자를 지원하려면 Supabase Auth를 붙이고 RLS 정책을 `auth.uid()` 기준으로 재작성해야 합니다.

앱 쪽 보호 장치:

- 로컬 세션에 주인(Spotify user id)을 기록해, 다른 계정으로 로그인하면 그 세션을 클라우드에 올리지 않고 먼저 묻습니다.
- 다른 기기에서 클라우드에 더 새 버전을 저장했으면 자동 백업을 멈추고 "클라우드 버전 불러오기 / 이 기기 버전으로 덮어쓰기" 중에서 고르게 합니다.

### 토큰 저장 방식

Spotify OAuth access/refresh 토큰은 브라우저 `localStorage`에 저장됩니다. 정적 SPA는 서버 측 세션 저장소를 쓸 수 없어 내린 절충입니다:

- 같은 브라우저 프로파일에서 실행되는 다른 스크립트/확장 프로그램이 토큰을 읽을 수 있으므로 확장 설치 시 주의하세요.
- 같은 컴퓨터의 다른 OS 사용자 계정은 기본적으로 접근 불가 (브라우저 프로파일 단위 격리).
- 로그아웃 시 토큰은 localStorage에서 완전히 제거됩니다(세션 데이터는 남습니다).
- 여러 탭에서 한 계정을 쓰는 경우 로그인/로그아웃 상태가 `storage` 이벤트로 자동 동기화됩니다.
- 토큰 갱신은 동시에 여러 요청이 와도 한 번만 하며, 일시적인 네트워크 오류로는 로그아웃하지 않습니다.

### 배포용 설정 (GitHub Actions Secrets)

GitHub 저장소 → **Settings → Secrets and variables → Actions → New repository secret** 에서 위 세 값을 등록합니다. `main` 브랜치에 push하면 Actions가 린트·테스트 후 이 값들을 빌드에 주입해 GitHub Pages에 배포합니다. PR에서는 `.github/workflows/ci.yml`이 린트·타입 검사·테스트·시뮬레이션 회귀·빌드를 돌립니다.

### 로컬 개발 설정

프로젝트 루트에 `.env.local` 파일 생성 (gitignore 대상):

```
VITE_SPOTIFY_CLIENT_ID=xxxxxxxxxxxxxxxx
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

### Spotify 앱 설정

Spotify Developer Dashboard에서 앱의 **Redirect URI**에 배포 URL을 정확히 등록해야 합니다:

- 배포본: `https://<유저명>.github.io/<저장소명>/` (**끝의 `/` 포함 필수**)
- 로컬 개발: `http://127.0.0.1:5173/` — Spotify는 리다이렉트 URI에 `localhost` 대신 루프백 IP를 요구하므로 `npm run dev -- --host 127.0.0.1`로 띄우고 그 주소로 접속하세요.

전곡 재생(Web Playback SDK)은 데스크톱 브라우저 + Spotify Premium에서만 됩니다. 그 밖의 경우(모바일, 무료 계정)에는 Spotify 임베드 플레이어로 대신 재생합니다.

## 개발

```bash
npm install
npm run dev          # 개발 서버
npm run lint         # ESLint
npm run typecheck    # tsc -b
npm test             # 단위 테스트 (Vitest)
npm run bench        # 정렬 알고리즘 시뮬레이션 (빠른 버전, 회귀 검사 포함)
npm run bench:full   # 문서에 실린 전체 시뮬레이션 (약 10분)
npm run build        # 프로덕션 빌드
npm run build:gh     # GitHub Pages용 빌드 (base 경로 자동)
```

Node 22 이상이 필요합니다.

## 폴더 구조

```
src/
  core/        순수 로직 — 레이팅 모델(rating/), 저장 형식·마이그레이션(session/). React·브라우저 API 없음
  services/    외부 입출력 — Spotify(auth·api·응답 검증), 저장소(localStorage·Supabase), 설정, 파일 내보내기
  state/       순수 리듀서 + Provider (로컬 자동 저장, 클라우드 동기화, 토스트)
  player/      Web Playback SDK 훅, 재생 요청 줄(playQueue), 재생 버튼, 임베드 대체 플레이어
  phases/      화면: import · tier · sort · rank
  components/  앱 틀(shell/: 사이드바·상단 바·탭 바)·저장 상태·공용 UI(ui/)
  hooks/ lib/ theme/
bench/         가상 사용자 시뮬레이션 (v1 알고리즘 재현 포함)
docs/          분석 문서
```

## 데이터 형식

- localStorage `eloState`에 저장 형식 v2(`version: 2`)로 저장합니다. 비교 기록(`matches`)이 원본이고 레이팅·불확실성은 여기서 계산되는 값입니다.
- v1 세션은 처음 열 때 자동으로 v2로 옮겨지며, 기존 순위가 유지됩니다. v1 원본은 `eloState.v1-backup`에 한 번 보관됩니다.
- 불러오기 화면의 **백업 파일**로 세션 전체를 JSON으로 내보내거나 다시 불러올 수 있습니다.

## 기술 스택

- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS 4 (Apple Music 풍, CSS 변수 기반 라이트/다크 테마), 시스템 글꼴 + Pretendard, lucide 아이콘
- **Auth**: Spotify OAuth (PKCE)
- **Playback**: Spotify Web Playback SDK (데스크톱 + Premium), 그 외 Spotify 임베드
- **Storage**: localStorage (로컬 세션) + Supabase (클라우드 백업) + JSON 백업 파일
- **Test**: Vitest (단위 테스트 + 시뮬레이션)
- **Deployment**: GitHub Pages + GitHub Actions
