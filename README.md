# ELO Sorter

Spotify 좋아요 곡 및 플레이리스트를 ELO 레이팅 기반으로 비교 정렬하는 개인용 PWA.

## 사용 흐름

1. **Spotify 로그인** (PKCE 기반 OAuth)
2. **불러오기** — 좋아요 곡 또는 플레이리스트를 소스로 선택
3. **티어 분류** — 각 곡을 직감으로 Tier 1~3 중 하나로 분류 (초기 ELO 값 부여)
4. **비교 정렬** — 같은 tier 내 두 곡씩 페어링으로 비교, ELO로 순위 정밀화
5. **랭킹** — 최종 정렬된 순위 확인
6. **동기화** — Spotify에서 신규 추가/삭제된 곡 감지 후 선택적으로 반영

## 키보드 단축키

| 단축키 | 동작 | 단계 |
|---|---|---|
| `1` / `2` / `3` | 현재 곡을 Tier 1/2/3에 배정 | 티어 분류 |
| `Z` | 티어 배정 되돌리기 | 티어 분류 |
| `Ctrl` + `,` *(Mac: `Cmd` + `,`)* | **설정 모달 열기/닫기** (전역) | 모든 단계 |

`Ctrl+,` 단축키는 UI에 설정 버튼을 노출하지 않고 유지되는 숨김 기능입니다. 평소에는 환경 변수로 Spotify/Supabase 정보가 주입되지만, 빌드 시 주입이 실패하거나 값을 수동으로 바꾸고 싶을 때의 탈출구로 사용하세요.

## 설정

### 환경 변수

빌드 시 세 가지 값이 필요합니다.

| 변수명 | 설명 |
|---|---|
| `VITE_SPOTIFY_CLIENT_ID` | Spotify 앱 Client ID (Redirect URI 화이트리스트로 보호) |
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |

### ⚠️ Supabase 보안 주의

이 앱은 **한 Supabase 프로젝트당 한 사용자** 를 가정합니다. 각 세션은 Spotify user ID를 primary key로 `elo_state` 테이블에 저장되므로, 동일 Spotify 계정의 여러 기기 간에는 세션이 공유됩니다.

`anon key`를 아는 사람은 RLS 정책과 무관하게 이 테이블에 접근할 수 있습니다(현재 구현은 Supabase Auth를 사용하지 않습니다). 따라서:

- 배포 URL과 anon key를 **신뢰하지 않는 사람과 공유하지 마십시오**. 공유 즉시 그 사람은 테이블 전체를 읽고/쓰고/지울 수 있습니다.
- 여러 사용자가 같은 Supabase 프로젝트를 공유하면 서로의 행을 덮어쓸 수 있습니다.
- 공유가 필요하다면 Supabase Auth를 붙여 RLS를 제대로 활용하도록 개조해야 합니다.

### 배포용 설정 (GitHub Actions Secrets)

GitHub 저장소 → **Settings → Secrets and variables → Actions → New repository secret** 에서 위 세 값을 등록합니다. `main` 브랜치에 push하면 Actions가 자동으로 이 값들을 빌드에 주입합니다.

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
- 로컬 개발: `http://localhost:5173/` 등 실제 개발 서버 주소

## 개발 & 배포

```bash
npm install
npm run dev        # 로컬 개발 서버
npm run build      # 기본 빌드
npm run build:gh   # GitHub Pages용 빌드 (base 경로 자동)
```

`main` 브랜치 push 시 `.github/workflows/deploy.yml` 이 자동으로 빌드 후 GitHub Pages에 배포합니다.

## 기술 스택

- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS 4 (일부) + 인라인 스타일
- **Auth**: Spotify OAuth (PKCE)
- **Playback**: Spotify Web Playback SDK (데스크톱) / iframe embed (모바일 폴백)
- **Storage**: localStorage (로컬 세션) + Supabase (클라우드 백업)
- **Deployment**: GitHub Pages + GitHub Actions

## 알고리즘 요약

- **초기 ELO**: Tier 1→1829, Tier 2→1605, Tier 3→1365 (P_mid 기반 probit)
- **비교**: 같은 tier 내 우선 페어링, 같은 점수대(±100) 경계에선 K=60으로 가속
- **K 값**: 비교 ≤15회 K=48, ≤40회 K=24, 이후 K=12
- **목표 분포**: Tier 1 10% / Tier 2 40% / Tier 3 50% (권장, 엄격 강제 아님)
