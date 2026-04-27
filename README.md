![leesfield logo](public/logo.webp)

<h1 align="center">
  <strong>leesfield</strong>
</h1>

<p align="center">
  <strong>AI 생성 플랫폼</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20.9.0-brightgreen" alt="Node.js">
  <img src="https://img.shields.io/badge/next-16.1.1-black" alt="Next.js">
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#주요-기능">주요 기능</a> •
  <a href="#api-문서">API 문서</a> •
  <a href="https://leesfield.leey00nsu.com">데모</a>
</p>

---

## 목차

- [Quick Start](#quick-start)
- [주요 기능](#주요-기능)
- [기술 스택](#기술-스택)
- [설치 및 설정](#설치-및-설정)
- [API 문서](#api-문서)
- [프로젝트 구조](#프로젝트-구조)
- [테스트](#테스트)
- [문제 해결](#문제-해결)
- [문서](#문서)

## Quick Start

```bash
# 1. 저장소 복제 및 설치
git clone <repository_url> && cd leesfield-fe
pnpm install

# 2. 환경 변수 설정
cp .env.example .env

# 3. 데이터베이스 준비
docker compose up -d
pnpm db:prepare

# 4. 개발 서버 실행
pnpm dev
```

## 주요 기능

### 🎨 AI 생성

- 이미지/비디오 생성 대시보드
- 생성 히스토리 조회 및 관리

### 📊 모델 관리

- 모델 카탈로그 등록/수정
- 모니터링 대시보드

### 🔗 API 통합

- RESTful API 및 자동 생성 OpenAPI 문서
- API 키 기반 인증

### 🌐 국제화 (i18n)

- next-intl 기반 다국어 지원 (한국어, 영어)

## 기술 스택

| 영역           | 기술                    |
| -------------- | ----------------------- |
| **Framework**  | Next.js 16 (App Router) |
| **Language**   | TypeScript              |
| **Styling**    | Tailwind CSS, shadcn/ui |
| **State**      | TanStack Query          |
| **Form**       | React Hook Form         |
| **Validation** | Zod                     |
| **Database**   | PostgreSQL, Prisma      |
| **Auth**       | iron-session            |
| **Test**       | Vitest                  |
| **DevOps**     | Docker, Husky, pnpm     |

## 설치 및 설정

### 사전 요구사항

- Node.js `>=20.9.0`
- pnpm
- Docker (PostgreSQL)

### 1) 환경 변수

`.env.example`을 복사하여 `.env` 파일을 생성하세요:

```bash
cp .env.example .env
```

각 변수에 대한 상세 설명과 설정 방법은 [.env.example](.env.example) 파일을 참고하세요.

### 비밀번호 해시 생성

```bash
pnpm gen:admin-password-hash
```

출력된 값은 base64url 형태이므로 그대로 `.env`에 넣으면 됩니다.

### 2) 로컬 DB 실행 (PostgreSQL)

```bash
docker compose up -d
```

### 3) 개발 서버 실행

```bash
pnpm dev
```

### 4) 이미지/비디오/오디오 저장 어댑터

현재 지원 어댑터:

- `leemage` (기본값)

설정:

- `IMAGE_STORAGE_PROVIDER`로 저장 어댑터를 선택합니다.
- `VIDEO_STORAGE_PROVIDER`, `AUDIO_STORAGE_PROVIDER`도 동일하게 저장 어댑터를 선택합니다.
- `leemage`를 사용하는 경우 `LEEMAGE_API_KEY`, `LEEMAGE_PROJECT_ID`가 필수입니다.
- 이미지/비디오에서 저장소 설정이 없거나 지원되지 않는 경우: 결과는 즉시 응답되지만 히스토리(DB) 저장은 생략됩니다.
- 오디오에서 저장소 설정이 없거나 지원되지 않는 경우: 외부 저장소 업로드를 건너뛰고 inline 결과를 DB에 저장합니다.

### 5) 어댑터 구현 방식

이 프로젝트는 **API 호출(생성)**과 **저장소 업로드**를 각각 어댑터 패턴으로 분리했습니다.

#### 1) API 호출 어댑터 (이미지/비디오 생성)

현재 구현된 provider:

- 이미지: `hf_space`, `codex_cli`, `codex_bridge`
- 비디오: `hf_space`

설정/선택:

- 각 모델의 `provider`가 실제 어댑터 선택에 사용됩니다.
- 모델 정의는 DB의 모델 카탈로그에서 관리합니다.

추가 방법:

1. 어댑터 파일 추가
   - 이미지: `src/server/image-generation/adapters/`
   - 비디오: `src/server/video-generation/adapters/`
2. `types.ts`의 인터페이스 구현
3. `image-generation.ts` / `video-generation.ts`에서 제공자 분기 추가
4. 모델 카탈로그(DB) 갱신
5. 필요 시 `.env.example`에 새 제공자 설정 추가

`codex_bridge` provider는 별도 `codex-image-bridge` 서비스가 Codex CLI/OAuth를 소유하는 운영 구성을 위한 provider입니다. leesfield 앱에는 `CODEX_IMAGE_BRIDGE_URL`과 `CODEX_IMAGE_BRIDGE_TOKEN`만 설정하면 되고, 메인 앱 컨테이너에 `codex` CLI를 설치할 필요가 없습니다. `CODEX_IMAGE_BRIDGE_URL`은 path 없는 `http(s)` origin/root URL이어야 하며, 앱은 `/v1/images/jobs`로 job을 만든 뒤 `/v1/images/jobs/{jobId}`를 polling합니다.

#### 2) 저장소 어댑터 (이미지/비디오/오디오 업로드)

기본 제공자:

- 이미지 저장: `leemage`

설정/선택:

- 이미지: `IMAGE_STORAGE_PROVIDER`로 선택합니다. (기본: `leemage`)
- 비디오: `VIDEO_STORAGE_PROVIDER`로 선택합니다. (기본: `leemage`)
- 오디오: `AUDIO_STORAGE_PROVIDER`로 선택합니다. (기본: `leemage`)
- `leemage` 사용 시 `LEEMAGE_API_KEY`, `LEEMAGE_PROJECT_ID`가 필수입니다.
- Leemage 업로드/삭제 클라이언트는 공식 npm 패키지 `leemage-sdk`를 사용합니다.
- 과거 내부 경로(`src/shared/lib/leemage-sdk`)는 제거되었으며, 현재 런타임에서는 사용하지 않습니다.
- 이미지/비디오는 설정이 없거나 지원되지 않으면 **결과는 응답되지만 히스토리(DB) 저장은 생략**됩니다.
- 오디오는 설정이 없거나 지원되지 않으면 **외부 저장소 업로드를 건너뛰고 inline 결과를 히스토리(DB)에 저장**합니다.

추가 방법:

1. 저장 어댑터 구현 추가
   - 이미지: `src/server/image-generation/storage/adapters/`
   - 비디오: `src/server/video-generation/storage/adapters/`
   - 오디오: `src/server/audio-generation/storage/adapters/`
2. `storage-adapter.ts` 인터페이스 구현
3. `storage-selector.ts`에 선택 규칙 추가
4. 필요 시 `.env.example`에 새 저장소 설정 추가

### 6) 모델 카탈로그 관리

모델 정의/파라미터는 DB의 모델 카탈로그에서 JSON 구조로 저장됩니다.
관리 화면에서 등록/수정한 설정이 생성 요청과 검증에 사용됩니다.

자세한 스키마 정보: [모델 카탈로그 가이드](MODEL_CATALOG.md)

### 7) 이미지 생성 저장 구조

이미지 생성 요청은 핵심 컬럼(예: prompt/steps/size)과 함께 `requestParams` JSON 컬럼에도 저장됩니다.
모델별 파라미터가 달라져도 히스토리를 보존하기 위한 목적입니다.

## API 문서

### 인증

- **외부 API 인증**: `x-api-key` 헤더 사용

### OpenAPI

- **웹 UI**: `/api-docs`
- **JSON**: `/api/openapi`

### 외부 API 사용

모델별 `provider` 값에 따라 API 호출 어댑터가 선택됩니다.
현재 이미지 호출 어댑터는 `hf_space`, `codex_cli`, `codex_bridge`이며, provider별 설정은 모델 카탈로그(DB)에서 관리합니다. `codex_bridge` token 값은 DB가 아니라 env로만 읽습니다.

외부 API 엔드포인트:

- `POST /api/external/image-generation`
- `GET /api/external/image-generation/{requestId}`
- `POST /api/external/video-generation`
- `GET /api/external/video-generation/{requestId}`
- `GET /api/external/models`

## 프로젝트 구조

**Feature-Sliced Design (FSD)** 아키텍처를 따릅니다.

```
src/
├── app/              # Next.js App Router (라우팅 전용)
├── screens/          # 페이지 컴포넌트
├── widgets/          # 독립적인 UI 블록
├── features/         # 비즈니스 기능 단위
├── entities/         # 비즈니스 엔티티
├── shared/           # 공용 유틸리티/컴포넌트
└── server/           # 서버 전용 코드
```

의존성 규칙: `app` → `screens` → `widgets` → `features` → `entities` → `shared`

## 개발 스크립트

```bash
pnpm build
pnpm start
pnpm lint
pnpm typecheck
```

## 테스트

```bash
# 테스트 실행
pnpm test

# 워치 모드
pnpm test:watch
```

## 문제 해결

<details>
<summary><strong>데이터베이스 연결 오류</strong></summary>

```bash
docker compose ps      # 상태 확인
docker compose restart postgres  # 재시작
```

</details>

<details>
<summary><strong>세션/인증 오류</strong></summary>

- `SESSION_PASSWORD`가 32자 이상인지 확인
- `.env.example` 설정 참조

</details>

<details>
<summary><strong>저장소 연결 실패</strong></summary>

- `LEEMAGE_API_KEY`, `LEEMAGE_PROJECT_ID` 설정 확인
- Leemage 서비스 상태 확인

</details>

## 문서

- 스펙/계획/태스크: `../docs/features/`
- 디자인 레퍼런스: `../docs/designs/`

## 라이선스

[MIT License](LICENSE)
