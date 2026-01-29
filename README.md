![leesfield logo](public/logo.webp)

<h1 align="center">
  <strong>leesfield-fe</strong>
</h1>

<p align="center">
  <strong>AI 이미지/비디오 생성 서비스 대시보드</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D20.9.0-brightgreen" alt="Node.js">
  <img src="https://img.shields.io/badge/next-16.1.1-black" alt="Next.js">
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#주요-기능">주요 기능</a> •
  <a href="#기술-스택">기술 스택</a> •
  <a href="#설치-및-설정">설치 및 설정</a> •
  <a href="#api-문서">API 문서</a>
</p>

<p align="center">
  <img src="public/sample-image.png" alt="Leesfield Screenshot" width="800" />
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

→ [http://localhost:3000](http://localhost:3000)

## 주요 기능

- 이미지/비디오 생성 대시보드
- 생성 히스토리 조회
- 모델 카탈로그/관리
- API 키 관리 및 외부 API 제공
- 모니터링 대시보드
- OpenAPI 문서 제공
- 다국어(i18n) 지원

## 기술 스택

| 영역           | 기술                       |
| -------------- | -------------------------- |
| **Framework**  | Next.js 16 (App Router)    |
| **Language**   | TypeScript                 |
| **Styling**    | Tailwind CSS, shadcn/ui    |
| **State**      | TanStack Query             |
| **Form**       | React Hook Form            |
| **Validation** | Zod                        |
| **Database**   | PostgreSQL, Prisma         |
| **Auth**       | iron-session               |
| **Test**       | Vitest                     |
| **DevOps**     | Docker, Husky, pnpm        |

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

### 4) 이미지/비디오 저장 어댑터

현재 지원 어댑터:

- `leemage` (기본값)

설정:

- `IMAGE_STORAGE_PROVIDER`로 저장 어댑터를 선택합니다.
- `leemage`를 사용하는 경우 `LEEMAGE_API_KEY`, `LEEMAGE_PROJECT_ID`가 필수입니다.
- 저장소 설정이 없거나 지원되지 않는 경우: 결과는 즉시 응답되지만 히스토리(DB) 저장은 생략됩니다.

### 5) 어댑터 구현 방식

이 프로젝트는 **API 호출(생성)**과 **저장소 업로드**를 각각 어댑터 패턴으로 분리했습니다.

#### 1) API 호출 어댑터 (이미지/비디오 생성)

현재 구현된 provider:

- 이미지: `hf_space`
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

#### 2) 저장소 어댑터 (이미지/비디오 업로드)

기본 제공자:

- 이미지 저장: `leemage`

설정/선택:

- 이미지: `IMAGE_STORAGE_PROVIDER`로 선택합니다. (기본: `leemage`)
- 비디오: `VIDEO_STORAGE_PROVIDER`로 선택합니다. (기본: `leemage`)
- `leemage` 사용 시 `LEEMAGE_API_KEY`, `LEEMAGE_PROJECT_ID`가 필수입니다.
- 설정이 없거나 지원되지 않으면 **결과는 응답되지만 히스토리(DB) 저장은 생략**됩니다.

추가 방법:

1. 저장 어댑터 구현 추가
   - 이미지: `src/server/image-generation/storage/adapters/`
   - 비디오: `src/server/video-generation/storage/adapters/`
2. `storage-adapter.ts` 인터페이스 구현
3. `storage-selector.ts`에 선택 규칙 추가
4. 필요 시 `.env.example`에 새 저장소 설정 추가

### 6) 모델 카탈로그 관리

모델 정의/파라미터는 DB의 모델 카탈로그에서 **JSON 구조로 저장**됩니다.  
관리 화면에서 등록/수정한 설정이 생성 요청과 검증에 사용됩니다.

#### JSON 스키마 요약

- **type**: `image` | `video`
- **key / label / vendor / provider**
- **providerConfig**: `hf_space` 설정 (예: `space_id`, `api_name`, `timeout_ms`)
- **parameters**: UI 및 검증 파라미터 정의
- **meta**: 기본값/제약/모달리티 정보

#### parameters (UI/검증)

`parameters`는 각 입력 필드의 UI와 검증 규칙을 정의합니다.

- **ui**: `range | input | textarea | select | toggle | hidden | card | upload`
- **required**: 필수 여부
- **min / max / step**: 범위/스텝
- **default**: 기본값
- **options**: `select`/`card` 옵션 목록

이미지 모델 키 예시:
`prompt`, `width`, `height`, `steps`, `modeChoice`, `guidanceScale`, `promptUpsampling`, `seed`, `imageCount`

비디오 모델 키 예시:
`prompt`, `initImage`, `durationSec`, `steps`, `guidanceScale`, `seed`, `aspectRatio`, `resolution`, `fps`

#### meta (기본값/제약)

`meta`는 모델별 기본값/제약 정보를 제공합니다.

- 이미지: `default_width`, `default_height`, `default_steps`, `concurrent_limit`, `max_input_images`
- 비디오: `default_width`, `default_height`, `default_duration_sec`, `default_fps`, `default_steps`, `default_guidance_scale`, `concurrent_limit`, `supports_init_image`

#### UI 구분 규칙

- `parameters.{field}.ui === "hidden"`이면 해당 입력 UI를 숨깁니다.
- `options`가 있는 경우 `select`/`card` 선택 UI로 렌더링됩니다.
- 기본값은 `parameters.{field}.default` → 없으면 `meta.default_*` → 공통 fallback 순으로 결정됩니다.

#### 모달리티 배지 기준

- **이미지**: `max_input_images > 0` 이면 `I2I` 추가, 기본은 `T2I`
- **비디오**: `supports_init_image` 또는 `i2v_model_id`가 있으면 `I2V`, `t2v_model_id`가 있으면 `T2V`

#### 스키마 확장 가이드

JSON 구조를 확장할 때는 아래를 함께 갱신하세요.

- 스키마 검증: `src/server/model-catalog/catalog-schema.ts`
- 런타임 기본값/제약: `src/server/model-catalog/runtime-models.ts`
- UI/검증 규칙: `src/shared/model-catalog/runtime-utils.ts`, `src/shared/model-catalog/runtime-schema.ts`
- 모달리티 규칙: `src/shared/model-catalog/modality.ts`

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
현재 구현된 호출 어댑터는 `hf_space`이며, Space ID/엔드포인트는
모델 카탈로그(DB)에서 관리합니다.

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
pnpm test
```

## 문제 해결

- DB 연결이 실패하면 `docker compose up -d` 상태를 확인하세요.
- 로그인/세션/저장소 관련 오류는 `.env.example` 설정을 확인하세요.

## 문서

- 스펙/계획/태스크: `../docs/features/`
- 디자인 레퍼런스: `../docs/designs/`
