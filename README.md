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
6. **동기화·백업** — Spotify에서 추가·삭제된 곡 반영, Life Hub 기기 동기화, JSON 백업 파일. 세션은 언제나 이 기기(localStorage)에 먼저 저장되고, 동기화를 끄면 이 기기와 백업 파일만 씁니다.

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

마우스 환경에서는 앨범 아트를 클릭해도 그 곡을 "확실히"로 고릅니다(터치 기기에서는 오조작을 막으려고 아트 탭이 기록하지 않고, 재생 가능하면 재생·일시정지만 합니다). 키를 누르고 있어도 반복 입력되지 않으며, 입력창·설정 창이 열려 있을 때는 단축키가 동작하지 않습니다.

## 알고리즘 요약

- **모델**: 베이지안 Bradley–Terry. `P(a가 b보다 좋다) = σ(θa − θb)`, 각 곡의 θ는 티어에서 온 정규 사전분포를 가집니다. 비교가 추가·삭제될 때마다 전체 비교 기록으로 사후 최빈값(MAP)을 다시 계산합니다 → 비교 순서와 무관하고, 되돌리기가 정확합니다.
- **표시 척도**: Elo와 같은 척도(1500 중심, 400점 차 = 오즈 10배). 레이팅 옆 `±`는 사후 표준편차입니다.
- **티어 사전분포**: 실제 분류 비율과 "직감 잡음"(τ = 0.5)을 반영한 절단정규 모델. 권장 비율로 나누면 약 1814 / 1600 / 1357.
- **다음 쌍**: 불확실성이 가장 큰 곡을 고르고, 레이팅이 가까운 곡 중 결과를 가장 예측하기 어려운 곡과 짝짓습니다.
- **예상 정확도**: 임의의 두 곡의 현재 순서가 맞을 확률의 추정치(50% = 무작위, 100% = 확정). 시뮬레이션에서 실제 정확도를 1~2%p 안에서 따라갑니다.

## 설정

### 환경 변수

빌드 시 한 가지 값이 필요합니다. 설정 창(헤더의 ⚙ 또는 `Ctrl+,`)에서 입력한 값은 이 브라우저에만 저장되며 환경 변수보다 우선합니다.

| 변수명 | 설명 |
|---|---|
| `VITE_SPOTIFY_CLIENT_ID` | Spotify 앱 Client ID (Redirect URI 화이트리스트로 보호) |

### 저장 위치

| 위치 | 언제 | 비고 |
|---|---|---|
| 이 기기 (`localStorage`의 `eloState`) | 항상 | 변경마다 자동 저장 |
| Life Hub | 설정에서 동기화를 켰을 때 | 여러 기기에서 이어서 하기 (아래 절) |
| JSON 백업 파일 | 직접 내려받거나 불러올 때 | 불러오기 화면의 "백업 파일". 연결 없이 기기를 옮기는 수동 경로 |

동기화를 끄면(또는 연결하지 않으면) 세션은 이 기기와 백업 파일에만 있습니다. 사이드바(좁은 화면은 상단 바)의 저장 상태가 "이 기기에 저장됨"으로 보입니다.

### Life Hub 기기 동기화

여러 기기에서 같은 세션을 이어서 하도록, 세션을 내 [Life Hub](https://github.com/KINGJNU-sakayume/life-hub)의 비공개 저장소(`/elosorter/v1/sync`)에 보관합니다. 설계와 API는 life-hub의 `docs/P6_SYNC.md`가 계약입니다.

- **연결**: 설정 → "Life Hub 연결". OAuth(Open Authorization, 개방형 인증) + PKCE(Proof Key for Code Exchange, 코드 교환 증명 키) 공개 클라이언트이고, scope는 `elosorter:sync elosorter:board`입니다(보드 타일 업로드는 아래 「보드 타일」 절). 클라이언트 식별 문서는 `public/lifehub-client.json`, 돌아오는 주소는 `public/lifehub/`입니다. 두 파일은 배포 주소(`https://kingjnu-sakayume.github.io/elosorter/`, vite `base`와 같음)에 묶여 있어 그 주소에서만 연결됩니다. Life Hub 쪽에는 배포 변수 `HUB_ELOSORTER_REDIRECT_URI`가 필요합니다.
- **토큰**: Spotify 토큰(`elo:spotify_*`)과 별도로 `localStorage`의 `elo:lifehub.*`에 저장됩니다. 위 "토큰 저장 방식"의 주의가 그대로 적용됩니다.
- **동기화 문서**: 압축하지 않은 JSON. 저장·백업 파일과 같은 형식에서, 앱이 불러올 때 다시 계산하는 곡의 `rating`·`sigma`만 뺍니다(`src/core/session/syncDoc.ts`). 크기는 설정 화면의 "동기화 문서 크기 / 한도"로 보이며, **900 KiB**(921,600바이트)를 넘으면 자동 동기화를 하지 않고 "너무 큼"으로 안내합니다. 잘라 내거나 일부만 올리지 않습니다.
- **충돌**: 세션의 `syncVersion`(이 기기 사본이 기반한 서버 version)으로 판단합니다. 쓰기는 `If-Match`로 하고, 서버 version이 다르면 자동으로 올리지 않고 "클라우드 것 쓰기 / 이 기기로 덮어쓰기"를 묻습니다. 클라우드 것을 쓰기 전의 이 기기 세션은 파일로 내려받을 수 있게 남겨 둡니다.
- **시점**: 앱 시작과 탭이 다시 보일 때 서버를 확인하고(폴링 없음), 변경 10개마다 또는 마지막 변경 15초 뒤에 올립니다. 오류 뒤에는 30초 뒤 다시 시도합니다.
- **끄기·로그아웃**: 동기화를 끄면 그 뒤로는 이 기기와 백업 파일에만 저장하고, 다시 켜면 꺼진 동안의 변경을 올립니다. 동기화가 켜져 있어도 Spotify에서 로그아웃하면 세션 주인을 확인할 수 없어 보내지 않습니다(이 기기에는 계속 저장).
- **다른 계정**: 로컬 세션에 주인(Spotify user id, `ownerId`)을 기록해, 다른 계정으로 로그인하면 그 세션을 Life Hub에 올리지 않고 먼저 묻습니다.
- 세션 내용은 공개 저장소·로그·오류 메시지에 들어가지 않습니다. 오류에는 상태 코드와 고정 문구만 보입니다.

### 보드 타일

[Life Board](https://github.com/KINGJNU-sakayume/board)에 보일 타일 목록(manifest v1)을 만들어 Life Hub(`PUT /elosorter/v1/board`, scope `elosorter:board`)에 올립니다. 올리는 것은 **보드용 목록뿐**이고 세션(곡 목록·비교 기록)은 올리지 않습니다. 규격은 board의 `docs/TILES.md`·`js/schema.js`, Hub 쪽은 life-hub `docs/P7_BOARD.md` 5장입니다. 모양은 보드가 정하고 이 앱은 데이터만 만듭니다.

| id | 타일 | 톤·형태 | 크기 (처음) | 처음부터 보임 | 데이터 출처 |
|---|---|---|---|---|---|
| `ranking` | 현재 순위 | type·list | 1x1 2x1 **2x2** | ✓ | 순위 상위 5곡(상세 창 12곡), 앨범 썸네일, 비교 횟수(`compCount`), 마지막 저장 날짜. ▲▼는 **마지막 비교 한 건이 바꾼 순위**: 마지막 비교를 뺀 기록으로 순위를 다시 계산해 비교합니다. 비교 기록이 없으면(v1에서 옮긴 세션) 빼고 보냅니다 |
| `last` | 최근 비교 | type·line | **2x1** 4x1 | | 마지막 비교 기록의 두 곡과 결과(확실히·조금 더·비슷함). 비교 기록에는 시각이 없어 날짜는 마지막 저장 날짜(`savedAt`)입니다 |
| `session` | 정렬 진행 | type·num | **1x1** 2x1 | | 예상 정확도(%)와 비교 수·분류한 곡 수·티어 분류만 했을 때의 정확도. 앱에 "남은 비교 수" 추정이 없어 정확도로 진행을 보여 줍니다 |
| `added` | 새로 들어온 곡 | strip (정사각) | 2x1 **4x1** | | Spotify에 추가된 날짜(`addedAt`) 최신 8곡의 표지, 분류 대기 곡 수. 다음에 분류할 곡이 보입니다 |

- **왜 이 타일인가**: 이번 주 몇 곡 같은 통계보다 최근 흐름(지금 순위, 방금 한 비교, 다음에 분류할 곡)을 보여 줍니다. 처음에는 `ranking`만 보이고, 나머지는 보드의 '위젯 추가'에서 켭니다. id는 사용자 배치가 저장되는 키라 바꾸지 않습니다.
- **만드는 곳**: `src/core/board/tiles.ts`의 `buildBoardTiles(session, now)` — 순수 함수(네트워크·저장소·무작위 없음, 같은 입력이면 같은 출력). 글자는 규격 길이로 자르고, 빈 글자는 필드째 뺍니다. 날짜는 "오늘·어제" 대신 `11/7`처럼 씁니다.
- **표지**: Spotify 앨범 아트 주소만 보냅니다(`https://i.scdn.co`, board 허용 출처). 행 썸네일·strip은 앱이 목록용으로 고른 이미지(Spotify가 주는 320px 이하 중 가장 큰 것, 보통 300×300)를 씁니다. 주소가 없거나 허용 출처 밖이면 첫 글자 칸(`{mono}`)입니다. 앨범 색을 앱이 모르므로 포인트색(`accent`)은 보내지 않습니다.
- **빈 상태**: 분류한 곡이 하나도 없으면 올리지 않습니다(새 기기가 빈 목록으로 다른 기기의 목록을 덮지 않게). 분류한 곡이 2곡 미만이면 `session`, 비교 기록이 없으면 `last`, 추가 날짜가 없으면 `added`를 뺍니다.
- **예시 출력**: [`board/sample.json`](board/sample.json) — 지어낸 세션(`src/core/board/sampleState.ts`)으로 만든 것. `npm run board:sample`로 다시 만들고, `npm run bench`가 코드와 같은지, `npm test`가 규격(board `js/schema.js` 복사본 `src/test/boardSchema.js`)을 통과하는지 확인합니다.
- **언제 올리나** (`src/services/lifehub/boardUpload.ts`, `src/state/useBoardUpload.ts`): 세션이 바뀌면 마지막 전송에서 10분이 지났으면 바로, 아니면 10분이 차는 때 한 번 보냅니다(**10분에 한 번 이하**). 내용이 마지막 성공과 같으면(`generated_at`을 뺀 sha256) 보내지 않지만, 앱을 열 때 마지막 성공이 하루보다 오래됐으면 같아도 한 번 보냅니다(보드의 '오래됨'은 Hub가 받은 시각 기준). 못 보낸 채 앱이 닫히면 다음에 열 때 보냅니다. 상태는 `localStorage`의 `elo:lifehub.board.v1`(개인 데이터 아님)에 둡니다.
- **어느 기기에서**: Life Hub에 연결된 기기 중, **이번 실행에서 동기화가 서버와 맞춘 뒤**의 기기만 올립니다(서버에 더 새 버전이 있거나 충돌 중이면 기다립니다). 그래서 받기 전의 옛 세션을 올리지 않습니다. 동기화하려면 Spotify 로그인이 필요하므로, 로그아웃 상태나 다른 계정의 세션이면 올리지 않습니다. 동기화 권한이 없는 연결이면 이 기기의 세션을 그대로 올립니다.
- **실패**: 네트워크 오류·5xx는 10분 뒤 다시 시도합니다. 400·413은 이 앱 쪽 문제라 같은 내용으로 다시 보내지 않고 개발자 콘솔에만 남깁니다(기기 시계가 5분 넘게 빠르면 400이 날 수 있습니다). 업로드 실패는 다른 기능을 막지 않습니다.
- **다시 연결이 필요한 경우**: board 권한(`elosorter:board`)이 생기기 전에 만든 연결은 첫 업로드가 `403 insufficient_scope`를 받습니다. 이때 Life Hub 토큰은 **지우지 않고**(동기화는 그대로) 설정의 Life Hub 섹션에 "보드에 올리려면 Life Hub에 다시 연결해 주세요"와 「다시 연결」을 보여 줍니다. 한 번 다시 연결하면 풀립니다. 401이 토큰 갱신 뒤에도 남거나 다른 403이면 동기화와 같은 규칙(연결 해제)을 따릅니다. 보드 요청 함수(`boardRequest`)는 동기화 요청 함수와 따로 둡니다.

### Supabase 백업을 쓰던 경우 (이전 안내)

예전 버전은 Supabase(`elo_state` 테이블)에 자동 백업했지만, Life Hub P6 계획 5단계에서 그 코드를 걷어 냈습니다. 이제 앱은 Supabase를 읽지도 쓰지도 않습니다. Supabase에만 있던 세션은 아래 순서로 옮기세요.

1. **JSON으로 내보내기**: Supabase 백업이 들어 있는 기기(또는 예전 버전 배포)에서 불러오기 화면 → 백업 파일 → "내려받기". 이 기기에 세션이 없다면 예전 버전에서 먼저 "클라우드 버전 불러오기"를 한 뒤 내려받습니다. 새 버전이 배포된 뒤에는 예전 버전을 커밋 `a112e62`(이 정리 직전)에서 로컬로 띄워(`npm run dev -- --host 127.0.0.1`, 설정에 Supabase URL·anon key 입력) 같은 일을 할 수 있습니다. Supabase 정책을 지우기 전에만 됩니다.
2. **Life Hub 연결**: 새 버전에서 설정 → "Life Hub 연결" → "동기화 켜기". 이 기기에 세션이 없으면 먼저 백업 파일 → "불러오기"로 1의 파일을 불러온 뒤 켭니다. "지금 동기화"를 누르면 바로 올라갑니다.
3. **다른 기기**: 같은 방법으로 연결하고 동기화를 켠 뒤 "클라우드 것 쓰기"로 이어서 합니다.

이 브라우저에 남아 있던 Supabase URL·anon key 설정(`localStorage`의 `eloConfig`)은 앱이 처음 열릴 때 조용히 지웁니다. Spotify Client ID는 그대로 남습니다.

### 토큰 저장 방식

Spotify OAuth access/refresh 토큰은 브라우저 `localStorage`에 저장됩니다. 정적 SPA는 서버 측 세션 저장소를 쓸 수 없어 내린 절충입니다:

- 같은 브라우저 프로파일에서 실행되는 다른 스크립트/확장 프로그램이 토큰을 읽을 수 있으므로 확장 설치 시 주의하세요.
- 같은 컴퓨터의 다른 OS 사용자 계정은 기본적으로 접근 불가 (브라우저 프로파일 단위 격리).
- 로그아웃 시 토큰은 localStorage에서 완전히 제거됩니다(세션 데이터는 남습니다).
- 여러 탭에서 한 계정을 쓰는 경우 로그인/로그아웃 상태가 `storage` 이벤트로 자동 동기화됩니다.
- 토큰 갱신은 동시에 여러 요청이 와도 한 번만 하며, 일시적인 네트워크 오류로는 로그아웃하지 않습니다.

### 배포용 설정 (GitHub Actions Secrets)

GitHub 저장소 → **Settings → Secrets and variables → Actions → New repository secret** 에서 `VITE_SPOTIFY_CLIENT_ID`를 등록합니다. `main` 브랜치에 push하면 Actions가 린트·테스트 후 이 값을 빌드에 주입해 GitHub Pages에 배포합니다. PR에서는 `.github/workflows/ci.yml`이 린트·타입 검사·테스트·시뮬레이션 회귀·빌드를 돌립니다.

### 로컬 개발 설정

프로젝트 루트에 `.env.local` 파일 생성 (gitignore 대상):

```
VITE_SPOTIFY_CLIENT_ID=xxxxxxxxxxxxxxxx
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
npm run board:sample # 보드 예시 출력(board/sample.json) 다시 만들기
npm run build        # 프로덕션 빌드
npm run build:gh     # GitHub Pages용 빌드 (base 경로 자동)
```

브라우저 E2E(End-to-End, 종단 간) 스모크는 사전 설치된 Playwright로 수동 실행합니다(의존성 추가 없음, CI(Continuous Integration, 지속적 통합)에는 없음). 모의 Spotify·모의 Life Hub로 구형 설정 로드, 로그아웃 사용, 동기화 끄기·켜기, 보드 업로드(권한 부족이어도 토큰 유지)를 확인하고 `*.supabase.co` 요청이 0건인지 봅니다.

```bash
npx vite build && (npx vite preview --port 4173 &) && node e2e/smoke.mjs
```

Node 22 이상이 필요합니다.

## 폴더 구조

```
src/
  core/        순수 로직 — 레이팅 모델(rating/), 저장 형식·마이그레이션(session/), 보드 타일 목록(board/). React·브라우저 API 없음
  services/    외부 입출력 — Spotify(auth·api·응답 검증), 저장소(localStorage), Life Hub 동기화·보드 업로드(lifehub/), 설정, 파일 내보내기
  state/       순수 리듀서 + Provider (로컬 자동 저장, Life Hub 동기화, 저장 상태, 토스트)
  player/      Web Playback SDK 훅, 재생 요청 줄(playQueue), 재생 버튼, 임베드 대체 플레이어
  phases/      화면: import · tier · sort · rank
  components/  앱 틀(shell/: 사이드바·상단 바·탭 바)·저장 상태·공용 UI(ui/)
  hooks/ lib/ theme/
bench/         가상 사용자 시뮬레이션 (v1 알고리즘 재현 포함)
board/         보드 타일 예시 출력 (지어낸 값)
e2e/           브라우저 E2E 스모크 (수동 실행)
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
- **Storage**: localStorage (로컬 세션) + Life Hub (기기 동기화) + JSON 백업 파일
- **Test**: Vitest (단위 테스트 + 시뮬레이션)
- **Deployment**: GitHub Pages + GitHub Actions
