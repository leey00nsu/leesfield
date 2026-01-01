# leesfield-fe

개인용 AI 생성 플랫폼(leesfield) 프론트엔드 레포입니다.

## 시작하기

### 1) 환경 변수

```bash
cp .env.example .env
```

필수 변수:
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `SESSION_PASSWORD` (32자 이상)
- `DATABASE_URL`

### 2) 로컬 DB 실행 (PostgreSQL)

```bash
docker compose up -d
```

### 3) 개발 서버 실행

```bash
pnpm dev
```

브라우저에서 `http://localhost:3000` 접속 후 로그인합니다.

## 테스트

```bash
pnpm test
```

## 로그인

`ADMIN_EMAIL` / `ADMIN_PASSWORD` 값으로 로그인합니다.

## 문서

- 스펙/계획/태스크: `docs/features/`
- 디자인 레퍼런스: `docs/designs/`
