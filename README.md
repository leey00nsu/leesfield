# leesfield-fe

AI 생성 플랫폼 leesfield

## 시작하기

### 1) 환경 변수

```bash
cp .env.example .env
```

필수 변수:

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

- `IMAGE_PROVIDER`
- `VIDEO_PROVIDER`
- `HF_TOKEN`
- `HF_IMAGE_SPACE_ID`
- `HF_VIDEO_SPACE_ID`
- `HF_IMAGE_SPACE_API_NAME`
- `HF_VIDEO_SPACE_API_NAME`
- `NEXT_PUBLIC_IMAGE_TIMEOUT_MS`
- `NEXT_PUBLIC_VIDEO_TIMEOUT_MS`

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
`.env.example`의 `HF_IMAGE_SPACE_ID`, `HF_VIDEO_SPACE_ID`를 설정하세요.

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

## 문서

- 스펙/계획/태스크: `docs/features/`
- 디자인 레퍼런스: `docs/designs/`
