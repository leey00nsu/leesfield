# leesfield-fe

AI 생성 플랫폼 leesfield

## 시작하기

### 1) 환경 변수

```bash
cp .env.example .env
```

#### 기본 환경변수

- `ADMIN_EMAIL`: 관리자 로그인 이메일
- `ADMIN_PASSWORD_HASH`: base64url 인코딩된 bcrypt 해시(아래 커맨드로 생성)
- `SESSION_PASSWORD`: 세션 암호(32자 이상)
- `DATABASE_URL`: Postgres 연결 문자열

- `NEXT_PUBLIC_IMAGE_TIMEOUT_MS` / `NEXT_PUBLIC_VIDEO_TIMEOUT_MS`: 프론트 폴링 타임아웃(ms)
- `NEXT_PUBLIC_API_BASE_URL`: API 문서 예시 요청에 표시할 Base URL
- `IMAGE_STORAGE_PROVIDER`: 이미지 저장 어댑터 선택 (미설정/미지원 시 히스토리 저장 생략)
- `VIDEO_STORAGE_PROVIDER`: 비디오 저장 어댑터 선택 (미설정/미지원 시 히스토리 저장 생략)

#### 어댑터 환경변수

- `HF_TOKEN`: Hugging Face Access Token (Public Space는 선택이지만 권장)

- `LEEMAGE_API_KEY` / `LEEMAGE_PROJECT_ID`: Leemage 업로드용 키/프로젝트 ID
- `LEEMAGE_STORAGE_PROVIDER`: Leemage 스토리지 제공자 명
- `LEEMAGE_BASE_URL`: 필요 시 커스텀 API 엔드포인트

※ `configs/*-models.json`은 모델별 provider/파라미터 설정을 관리합니다.

HF_TOKEN 발급 방법

1. Hugging Face 로그인
2. Settings → Access Tokens → New token (권한: Read)
3. 생성된 토큰을 `HF_TOKEN`에 입력

참고 링크(문서):

```text
https://huggingface.co/settings/tokens
https://huggingface.co/docs/hub/en/security-tokens
```

해시 생성:

```bash
pnpm gen:admin-password-hash
```

출력된 값을 그대로 `.env`에 넣으면 됩니다. (`$`는 자동으로 `\\$`로 출력됩니다)

`$` 이스케이프 이유:

- Next.js는 `.env`에서 `$VARIABLE` 형태를 다른 변수 참조로 확장합니다.
- bcrypt 해시는 `$`를 포함하므로, 값이 비어지는 것을 막기 위해 `\\$`로 이스케이프합니다.
- 참고: `https://nextjs.org/docs/app/guides/environment-variables#referencing-other-variables`

### 2) 로컬 DB 실행 (PostgreSQL)

```bash
docker compose up -d
```

### 3) 개발 서버 실행

```bash
pnpm dev
```

## 외부 API 사용

모델별 `provider` 값에 따라 API 호출 어댑터가 선택됩니다.
현재 구현된 호출 어댑터는 `hf_space`이며, Space ID/엔드포인트는
`configs/image-models.json`, `configs/video-models.json`에서 관리합니다.

## 이미지/비디오 저장 어댑터

현재 지원 어댑터:

- `leemage` (기본값)

설정:

- `IMAGE_STORAGE_PROVIDER`로 저장 어댑터를 선택합니다.
- `leemage`를 사용하는 경우 `LEEMAGE_API_KEY`, `LEEMAGE_PROJECT_ID`가 필수입니다.
- 저장소 설정이 없거나 지원되지 않는 경우: 결과는 즉시 응답되지만 히스토리(DB) 저장은 생략됩니다.

## 어댑터 구현 방식

이 프로젝트는 **API 호출(생성)**과 **저장소 업로드**를 각각 어댑터 패턴으로 분리했습니다.

### 1) API 호출 어댑터 (이미지/비디오 생성)

현재 구현된 provider:

- 이미지: `hf_space`
- 비디오: `hf_space`

설정/선택:

- 각 모델의 `provider`가 실제 어댑터 선택에 사용됩니다.
- 모델 정의는 `configs/*-models.json`에서 관리합니다.

추가 방법:

1. 어댑터 파일 추가
   - 이미지: `src/server/image-generation/adapters/`
   - 비디오: `src/server/video-generation/adapters/`
2. `types.ts`의 인터페이스 구현
3. `image-generation.ts` / `video-generation.ts`에서 제공자 분기 추가
4. 모델 카드/파라미터(`configs/*-models.json`) 갱신
5. 필요 시 `.env.example`에 새 제공자 설정 추가

### 2) 저장소 어댑터 (이미지/비디오 업로드)

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

## 테스트

```bash
pnpm test
```

## 로그인

로그인 입력 비밀번호는 `ADMIN_PASSWORD_HASH`(base64url 인코딩된 bcrypt 해시)와 비교됩니다.

예시 (직접 생성):

```bash
pnpm gen:admin-password-hash
```

생성된 값은 base64url 형태입니다.

## 모델 카드 설정 (configs/\*-models.json)

모델/어댑터/파라미터는 JSON 모델 카드에서 관리합니다. JSON은 주석을 지원하지 않으므로, 설명은 README에만 기록합니다.

기본 구조:

```json
{
  "version": 1,
  "default_model": "model-key",
  "models": [
    {
      "key": "model-key",
      "label": "Model Name",
      "vendor": "HUGGINGFACE",
      "provider": "hf_space",
      "pipeline": "diffusion",
      "model_id": "owner/space-or-model",
      "provider_config": {
        "space_id": "owner/space",
        "api_name": "/generate_image",
        "timeout_ms": 300000
      },
      "parameters": {
        "prompt": { "ui": "textarea", "required": true },
        "width": {
          "ui": "input",
          "min": 512,
          "max": 2048,
          "step": 1,
          "default": 1024
        },
        "height": {
          "ui": "range",
          "min": 512,
          "max": 2048,
          "step": 64,
          "default": 1024
        },
        "steps": {
          "ui": "range",
          "min": 1,
          "max": 20,
          "step": 1,
          "default": 9
        },
        "seed": { "ui": "input", "default": "" },
        "imageCount": { "ui": "hidden", "min": 1, "max": 1, "default": 1 }
      },
      "default_width": 1024,
      "default_height": 1024,
      "default_steps": 9,
      "max_input_images": 0
    }
  ]
}
```

`provider_config`는 **선택한 provider에 종속된 설정**입니다. 예를 들어 `hf_space`는
`space_id`, `api_name`, `timeout_ms`, `space_url` 등을 사용하며, 다른 provider는 자체 설정 키를 정의합니다.

파라미터 필드 규칙:

- `ui`: `range` | `input` | `textarea` | `select` | `toggle` | `hidden` | `card` | `upload`
- `min`/`max`/`step`/`default`: UI 범위 및 기본값
- `options`: select/card 등에 사용되는 선택지 목록
- `required`: 입력 필수 여부

이미지/비디오별로 지원 파라미터가 다를 수 있으며, UI/검증은 이 정의를 기준으로 동작합니다.

## 이미지 생성 저장 구조

이미지 생성 요청은 핵심 컬럼(예: prompt/steps/size)과 함께 `requestParams` JSON 컬럼에도 저장됩니다.
모델별 파라미터가 달라져도 히스토리를 보존하기 위한 목적입니다.

## 문서

- 스펙/계획/태스크: `docs/features/`
- 디자인 레퍼런스: `docs/designs/`
