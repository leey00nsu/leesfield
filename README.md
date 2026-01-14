# leesfield-fe

AI 생성 플랫폼 leesfield

## 시작하기

### 1) 환경 변수

```bash
cp .env.example .env
```

필수 변수(인증/DB):

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD_HASH`
- `SESSION_PASSWORD` (32자 이상)
- `DATABASE_URL`

이미지 저장(Leemage)용:

- `LEEMAGE_API_KEY`
- `LEEMAGE_PROJECT_ID`
- `LEEMAGE_STORAGE_PROVIDER`
- `LEEMAGE_BASE_URL` (선택)

외부 API 연동용(HF Space):

- `HF_TOKEN`
- `NEXT_PUBLIC_IMAGE_TIMEOUT_MS`
- `NEXT_PUBLIC_VIDEO_TIMEOUT_MS`
- `NEXT_PUBLIC_API_BASE_URL`

HF Space 설정 파일:

- `configs/image-models.json`
- `configs/video-models.json`

환경변수 설명

- `ADMIN_EMAIL`: 관리자 로그인 이메일
- `ADMIN_PASSWORD_HASH`: bcrypt 해시(아래 커맨드로 생성)
- `SESSION_PASSWORD`: 세션 암호(32자 이상)
- `DATABASE_URL`: Postgres 연결 문자열

- `LEEMAGE_API_KEY` / `LEEMAGE_PROJECT_ID`: Leemage 업로드용 키/프로젝트 ID
- `LEEMAGE_STORAGE_PROVIDER`: Leemage 스토리지 제공자 명
- `LEEMAGE_BASE_URL`: 필요 시 커스텀 API 엔드포인트

- `HF_TOKEN`: Hugging Face Access Token (Public Space는 선택이지만 권장)
- `NEXT_PUBLIC_IMAGE_TIMEOUT_MS` / `NEXT_PUBLIC_VIDEO_TIMEOUT_MS`: 프론트 폴링 타임아웃(ms)
- `NEXT_PUBLIC_API_BASE_URL`: API 문서 예시 요청에 표시할 Base URL
- HF Space의 `space_id`, `api_name`, `timeout_ms`, UI 파라미터는 `configs/*-models.json`에서 관리

HF_TOKEN 발급 방법

1) Hugging Face 로그인
2) Settings → Access Tokens → New token (권한: Read)
3) 생성된 토큰을 `HF_TOKEN`에 입력

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

현재는 Hugging Face Space(Gradio API)를 기본 제공자로 사용합니다.
Space ID/엔드포인트는 `configs/image-models.json`, `configs/video-models.json`을 수정하세요.

## 어댑터 구현 방식(외부 API 추가)

이미지/비디오 모두 어댑터 패턴으로 분리되어 있습니다. 새로운 외부 API를 붙이려면:

1) 어댑터 파일 추가
   - 이미지: `src/server/image-generation/adapters/`
   - 비디오: `src/server/video-generation/adapters/`
2) `types.ts`의 인터페이스 구현
3) `image-generation.ts` / `video-generation.ts`에서 제공자 분기 추가
4) 모델 카드/파라미터(`configs/*-models.json`) 갱신
5) 필요 시 `.env.example`에 새 제공자 설정 추가

## 테스트

```bash
pnpm test
```

## 로그인

로그인 입력 비밀번호는 `ADMIN_PASSWORD_HASH`(bcrypt 해시)와 비교됩니다.

예시 (직접 생성):

```bash
node -e "import('bcryptjs').then(b => b.hash('change-me', 10).then(console.log))"
```

> bcrypt 해시에는 `$`가 포함되므로 `.env`에 넣을 때는 `\\$`로 이스케이프해야 합니다.

## 모델 카드 설정 (configs/*-models.json)

Space/API/파라미터는 JSON 모델 카드에서 관리합니다. JSON은 주석을 지원하지 않으므로, 설명은 README에만 기록합니다.

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
      "api": {
        "space_id": "owner/space",
        "api_name": "/generate_image",
        "timeout_ms": 300000
      },
      "parameters": {
        "prompt": { "ui": "textarea", "required": true },
        "width": { "ui": "input", "min": 512, "max": 2048, "step": 1, "default": 1024 },
        "height": { "ui": "range", "min": 512, "max": 2048, "step": 64, "default": 1024 },
        "steps": { "ui": "range", "min": 1, "max": 20, "step": 1, "default": 9 },
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
