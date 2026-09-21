# Production worker 운영

## Coolify 배포와 시작

Node.js 서버가 시작될 때 `src/instrumentation.ts`의 `register()`가 환경을 검증한 뒤 generation worker, media-operation worker와 media-cleanup worker supervisor를 한 번만 시작한다. Edge runtime과 production build 단계에서는 worker를 시작하지 않는다. 생성 요청이 worker를 직접 다시 시작하려는 기존 경로도 남아 있지만 supervisor의 singleton guard를 통과한다.

Production은 Coolify의 `main` branch Auto Deploy와 Nixpacks build pack을 사용한다. repository root의 `nixpacks.toml`이 production start 명령과 health probe에 필요한 package를 정의한다. GitHub Actions 성공 여부는 현재 Coolify webhook 배포의 선행 조건이 아니다.

배포 시에는 다음 순서를 사용한다.

1. 유효한 production 환경변수와 PostgreSQL 연결을 준비한다.
2. Coolify가 repository를 Nixpacks로 build한다.
3. 새 컨테이너의 Nixpacks start 명령이 `pnpm release:migrate`로 환경 확인·Prisma 생성·migration과 history trigram index 생성을 실행한다. 실패하면 `&&` 뒤의 서버를 시작하지 않는다. index는 Prisma transaction 밖에서 `CREATE INDEX CONCURRENTLY`로 생성한다.
4. migration 성공 후 `pnpm start`로 Node 서버를 시작한다.
5. Coolify가 `/api/health/ready`의 200을 확인한 뒤 새 컨테이너에 트래픽을 보낸다.

Coolify pre-deployment command는 교체 전의 현재 컨테이너에서 실행되므로 새 source에 추가된 migration의 정본으로 사용하지 않는다. post-deployment command는 배포 성공 기록 뒤에 실행되므로 migration gate로 사용하지 않는다. 현재 start 단계 방식은 단일 replica 운영을 전제로 한다. replica를 늘리기 전에는 migration과 concurrent index 생성을 한 번만 수행하는 별도 release runner를 검토한다.

## Nixpacks image와 종료

Nixpacks는 repository의 manifest와 lockfile로 install/build/start plan을 만들고 Coolify가 생성된 image를 실행한다. `.dockerignore`는 `.env`, build output, backup 등 불필요하거나 민감한 파일을 build context에서 제외한다. `docker-compose.yml`은 로컬 PostgreSQL 용도이며 production application 배포에는 사용하지 않는다.

Coolify의 stop grace period는 35초로 설정한다. `SIGTERM` 이후 worker drain 상한은 25초이므로 강제 종료 전에 10초의 여유가 있다. readiness health check는 interval 10초, timeout 3초, retries 6회, start period 120초와 `/api/health/ready`를 사용한다. Nixpacks setup에 포함한 `wget`이 Coolify의 컨테이너 내부 HTTP probe를 실행한다.

배포가 실패했을 때 이전 image로 rollback할 수 있는지는 적용된 schema가 이전 코드와 호환되는지 먼저 판단한다. 적용된 migration을 수정하거나 down migration으로 되돌리지 않는다. 호환되지 않으면 forward-fix 또는 사전에 검증한 DB snapshot 복원을 선택한다.

`ops/nginx.conf.example`은 TLS를 종료하는 단일 reverse proxy 예제다. Nginx가 `X-Forwarded-For`를 `$remote_addr`로 덮어쓸 때만 `TRUST_PROXY_HEADERS=true`와 `TRUSTED_PROXY_HOPS=1`을 사용한다. 직접 app port를 공개하지 않고, client body 64 MiB, 일반 response 120초, SSE 경로 buffering off·45초 read timeout을 적용한다. 실제 인증서, upstream 주소, 방화벽과 load balancer 설정은 배포 환경에서 확인해야 한다.

## DB backup과 격리 restore

PostgreSQL client 도구가 설치된 release/maintenance host에서 custom-format dump를 만든다. script는 URL을 process argument나 log에 넣지 않고 `PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE`/`PGPASSWORD` 환경으로 `pg_dump`와 `pg_restore`를 호출한다. output은 임시 파일에 쓴 뒤 mode 0600으로 원자적으로 이동한다.
각 PostgreSQL tool process는 기본 30분 상한을 가지며 초과 시 종료되고 작업은 실패 처리된다.

```sh
BACKUP_FILE=./backups/leesfield-$(date -u +%Y%m%dT%H%M%SZ).dump \
  pnpm db:backup

RESTORE_TARGET=isolated \
RESTORE_CONFIRM=YES \
RESTORE_DATABASE_URL='postgresql://restore_user:<secret>@restore-db:5432/leesfield_restore' \
  pnpm db:restore -- --backup ./backups/leesfield-<timestamp>.dump

RESTORE_TARGET=isolated \
RESTORE_CONFIRM=YES \
RESTORE_DATABASE_URL='postgresql://restore_user:<secret>@restore-db:5432/leesfield_restore' \
  pnpm db:verify-restore
```

`db:restore`는 `RESTORE_TARGET=isolated`, `RESTORE_CONFIRM=YES`와 별도 `RESTORE_DATABASE_URL`이 없으면 중단하며 `DATABASE_URL`을 restore 대상으로 사용하지 않는다. source와 같은 host/port/database도 거부한다. 기본 restore는 빈 격리 DB를 전제로 하고, 기존 object를 지우는 `--clean`은 `RESTORE_ALLOW_CLEAN=YES`를 추가로 요구한다. 이 명령은 운영 DB 복원을 지원하지 않으므로 실제 production 복원은 승인된 DBA 절차와 별도 보호된 snapshot으로 수행한다.

`db:verify-restore`는 복원 대상의 `GenerationGraph`, `MediaAsset`, 세 generation table과 `MediaCleanupTask`의 row count를 조회한다. row count와 참조 무결성 확인 결과를 backup artifact의 commit/시각과 함께 보관한다. 현재 저장소에는 백업 scheduler나 Leemage object backup을 자동 구성하지 않는다. DB dump와 원격 media asset backup/versioning/retention은 별도 운영 책임이다.

Migration 실패는 release 단계의 non-zero 결과로 중단한다. 이미 적용된 migration을 수정하거나 down migration으로 되돌리지 않는다. 호환 가능한 이전 image로 drain/재기동할 수 없는 schema 변경이면 사전 snapshot을 격리 restore로 검증하고, 문제가 생겼을 때는 보존된 DB snapshot 복원 또는 forward-fix를 승인된 절차로 선택한다.

substring history 검색은 `pg_trgm`과 image/video/audio의 prompt/modelKey GIN index를 사용한다. `pnpm db:migrate:deploy`만 직접 실행하면 extension까지만 적용되므로 production release에서는 반드시 `pnpm release:migrate`를 사용한다. concurrent index 단계가 lock timeout 또는 statement timeout으로 실패하면 app 배포를 중단하고 같은 명령을 재실행한다. 향후 큰 table의 backfill과 index 생성도 단일 migration transaction에 넣지 않고, nullable schema 추가 → bounded backfill → constraint/index 전환으로 나눈다.

현재 코드만으로 확인되는 RPO/RTO는 없다. 운영자는 DB backup 주기·보존기간·암호화·접근권한·복원 담당자와 목표 RPO/RTO를 배포 전에 정하고, 격리 restore 소요시간과 실제 asset 복구 범위를 측정해 이 문서의 release 기록에 남겨야 한다.

## 보안 감사와 로컬 검증

`.github/workflows/production-security.yml`은 dependency 또는 workflow 변경과 매주 schedule에서 `pnpm security:production`을 실행한다. 이 workflow는 알려진 production dependency 취약점을 알리는 감사 신호이며 Coolify Auto Deploy를 차단하는 gate가 아니다.

Feature 완료 전에는 lee-spec-kit의 로컬 검사로 `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm security:production`, `pnpm test:production-integration`을 실행한다. production integration script는 호출자가 가진 `DATABASE_URL`을 사용하지 않고 1 GiB tmpfs의 PostgreSQL 16 컨테이너를 만들며 migration과 전체 테스트가 끝나면 `--rm` 컨테이너를 stop한다. Docker나 PostgreSQL image를 사용할 수 없는 환경에서는 통합 검사를 성공으로 건너뛰지 않는다.

안전한 harness 확인은 다음 명령으로 실행한다.

```sh
pnpm load:stub-smoke
```

이 명령은 외부 네트워크·DB·provider 없이 loopback stub에서 10/50/100 RPS와 500건 burst를 실행한다. stub 결과는 애플리케이션 처리량으로 해석하지 않는다. 실제 앱 부하는 `scripts/load/production-readiness.k6.js`를 사용하며 `LOAD_CONFIRM=YES`가 필요하고 loopback이 아닌 대상은 `LOAD_ALLOW_NONLOCAL=YES`가 추가로 필요하다. 기본 읽기 비율은 History·Model·Monitoring 40%·40%·20%다.

```sh
LOAD_CONFIRM=YES \
LOAD_TARGET=http://127.0.0.1:3000 \
LOAD_AUTH_COOKIE='<local-admin-session-cookie>' \
k6 run scripts/load/production-readiness.k6.js
```

기본 profile은 각 10/50/100 RPS 구간 5초와 회복 구간 5초 뒤 500건 burst를 보내며, `LOAD_PROFILE=full`은 각 구간 2분·회복 30초로 실행한다. 기록할 값은 p95/p99, 예상 밖 5xx, 429, 503, 인증 오류, dropped iterations, RSS·event-loop delay, pool waiting, queue oldest age, worker 상태와 burst 이후 readiness 회복이다. 401/403은 fixture 또는 cookie 오류로 실패 처리하며 429/503은 별도 admission 결과로 집계한다. 10 RPS의 초기 기준은 p95 1초 미만·예상 밖 5xx 1% 미만·dropped 0이며 50/100 RPS는 수용 SLO가 아니라 측정 결과다. 현재 실제 앱 k6 결과와 provider 처리량은 확인하지 않았다.

2026-09-18 local loopback stub smoke는 모든 요청 실패 0건으로 완료됐다. 10 RPS는 21건·p95 5.08 ms·p99 9.61 ms, 50 RPS는 101건·p95 2.63 ms·p99 3.40 ms, 100 RPS는 201건·p95 2.23 ms·p99 2.90 ms였다. 500건 burst는 133.86 ms에 끝났고 p95 115.91 ms·p99 117.64 ms였다. 이 실행 환경에는 k6 binary와 인증된 격리 앱 fixture가 없어 실제 앱 시나리오는 실행하지 않았다. 이 수치는 harness 동작 증거일 뿐 앱 용량이나 SLO 통과 증거가 아니다.

## Catalog와 API key 사용 시각

ModelCatalog cache는 프로세스별로 active/all 두 범위를 각각 60초 동안 보관한다. 같은 범위의 동시 cache miss는 하나의 in-flight DB 조회를 공유하고, 조회 실패는 cache에 기록하지 않아 다음 요청이 재시도한다. 관리자 변경 뒤 진행 중인 이전 조회가 새 cache를 복원하지 않으며, 변경 endpoint는 현재 프로세스 cache도 무효화한다.

다른 프로세스의 cache 무효화 전파를 운영 구성에 의존하지 않는다. Classic·Node·외부 generation admission은 제출 transaction 안에서 ModelCatalog의 현재 `isActive`와 media type을 다시 확인하므로 오래된 catalog로 신규 실행을 예약할 수 없다. 이미 예약된 작업은 worker claim 시 DB의 현재 `meta.concurrent_limit`를 읽어 오래된 runtime 설정으로 모델별 한도를 초과하지 않는다.

외부 API key 인증은 매 요청마다 DB의 key hash와 `status`를 확인한다. `lastUsedAt`은 감사 로그가 아니라 근사 사용 시각이며 5분보다 오래된 경우에만 `status=active` 조건부 UPDATE를 시도한다. 여러 프로세스가 동시에 touch해도 row 조건이 다시 평가되며, 이 부가 기록의 실패는 인증된 요청을 실패시키지 않는다. 폐기 검사는 이 경로와 분리된 정본 조회이므로 즉시 거부한다.

## SSE 연결과 느린 소비자

Graph generation event stream은 인증된 owner scope당 최대 5개, Node 프로세스당 최대 50개 subscriber를 허용한다. 이 값은 프로세스 로컬 예산이며, 여러 앱 인스턴스의 전체 연결 수를 보장하지 않는다. 전체 연결을 별도로 제한해야 하는 배포에서는 trusted ingress의 connection cap을 함께 설정한다. 프로세스는 PostgreSQL LISTEN 연결 하나를 공유하며 Graph별 subscriber에만 해당 event를 전달한다.

각 SSE `ReadableStream`은 32개 event chunk의 high-water mark를 사용한다. `desiredSize`가 0 이하가 되면 느린 reader로 판단해 stream을 닫고 heartbeat timer, abort listener와 broker subscription을 즉시 해제한다. broker cap 초과는 `stream.overloaded`와 `retryAfterMs=10000`으로 알리고, 브라우저는 이를 받은 뒤 최소 10초의 exponential backoff와 0.75~1.25 jitter로 재접속한다. 연결 중에는 15초 safety poll, 연결 실패·overload·EventSource 미지원 시에는 2초 owner-scoped DB polling이 상태의 정본을 회복한다. heartbeat는 15초 간격이며 client watchdog은 35초다.

## 종료와 재시작

`SIGTERM` 또는 `SIGINT`를 받으면 supervisor가 새 claim을 막고 세 worker의 interval을 중지한다. 이미 claim한 generation, media operation과 cleanup task는 최대 25초 동안 drain하며, 같은 signal handler를 여러 번 등록하지 않는다. drain 시간이 지나면 프로세스는 종료되고 아직 실행 중인 lease는 만료 뒤 다음 worker tick에서 recovery 대상이 된다.

lease 만료가 provider의 원격 실행까지 취소한다는 보장은 없다. 원격 결과를 다시 제출해 중복 과금할 수 있는 작업은 원격 id/jobId와 durable submission이 확인되지 않는 한 자동 재생성하지 않는다.

## Provider·storage·download I/O

provider 결과와 storage relay/download는 공통 bounded reader를 사용한다. 결과는 최대 8개, aggregate 512 MiB로 제한하고 매체별 파일 상한은 image 25 MiB, audio 100 MiB, video 500 MiB다. 512 MiB는 단일 요청이 process memory를 독점하지 못하게 하는 절대 안전 상한이며, output은 남은 aggregate budget을 다음 fetch/decode 전에 계산해 순차 처리한다. input도 최대 8개·aggregate 512 MiB로 순차 처리한다. HTTP 응답은 header 이후 body가 계속 도착하지 않아도 전체 deadline에서 종료되며, 선언된 `Content-Length`와 실제 stream 바이트를 모두 확인한다. provider/storage가 돌려준 download URL은 redirect hop마다 public address인지 확인하고 검증한 DNS address를 실제 socket에 고정한다.

generation body는 30초 안에 읽히지 않거나 client가 연결을 끊으면 중단한다. process당 heavy ingress permit은 2개이며 body parse부터 input upload와 submission 완료까지 유지한다. slot이 없으면 대기열을 늘리지 않고 503 `INGRESS_BUSY`를 반환한다.

generation owner/API key burst는 3건, upload burst는 2건, monitoring stats burst는 5건, 일반 read burst는 30건이다. PostgreSQL token bucket의 거부 상태는 한 token의 남은 deficit만 저장하므로 거부 요청을 반복해도 recovery 시간이 계속 늘어나지 않는다. 모든 429에는 계산된 `Retry-After`가 포함된다.

Classic·외부 API·provider-backed Node 실행은 payload와 결합된 idempotency key를 submission ledger에서 원자적으로 처리한다. failed 제출의 재시도는 advisory transaction 안에서 한 요청만 `preparing`으로 reclaim하고 나머지는 원래 request ID를 재사용한다. 브라우저 client는 같은 payload의 transport/5xx 재시도에서만 key를 유지하고 payload가 바뀌면 새 key를 만든다.

Leemage 파일은 presign → bounded PUT → confirm 순서로 처리한다. upload PUT은 120초 deadline과 선언 크기 검사를 사용하고, Modal upload/job 요청처럼 durable idempotency key가 있는 요청만 최대 3회(1/2/4초 exponential backoff와 작은 jitter) 재시도한다. 429/5xx는 retryable로 분류하지만, 결과 GET과 SDK가 취소를 지원하지 않는 호출의 caller timeout을 재시도나 취소 보장으로 해석하지 않는다.

운영 중에는 `IO_RESPONSE_TOO_LARGE`, `IO_STREAM_ABORTED`, provider 429/5xx, upload timeout을 구분해 기록해야 한다. 원격 provider가 취소를 지원하지 않아 lease 만료 뒤 side effect가 남을 수 있으므로, 해당 request/job ID를 reconcile·cleanup 확인 항목으로 남긴다.

## 복구 규칙

- lease가 없는 legacy `processing`/`uploading` generation은 자동 재실행하지 않고 `failed`와 `EXECUTION_LEASE_RECOVERY_REQUIRED`로 수렴한다. 취소가 기록된 row는 `cancelled`로 수렴한다.
- lease가 만료된 generation은 `failed`와 `EXECUTION_LEASE_EXPIRED`로 수렴하며 이전 worker의 heartbeat와 terminal write는 fencing 조건에서 거절된다.
- remove-background media operation은 인스턴스 전체에서 최대 2개만 claim한다. 각 claim은 60초 lease를 갖고 10초마다 heartbeat를 갱신하며, legacy lease 없는 row는 `MEDIA_OPERATION_LEASE_RECOVERY_REQUIRED`, 만료 row는 `MEDIA_OPERATION_LEASE_EXPIRED`로 수렴한다.
- Modal 작업은 저장된 submission과 remote `jobId`가 있으면 상태·결과 조회를 재개한다. POST 직후 ID 저장이 불확실하면 동일 durable payload와 idempotency key로 먼저 reconcile하며, 확인되지 않은 비멱등 작업을 임의로 다시 만들지 않는다.
- provider/storage 결과 commit이 lease를 잃으면 DB 결과를 저장하지 않는다. media operation이 upload 단계에서 lease를 잃으면 이미 생성된 storage object를 정리하고, 확인되지 않은 원격 side effect는 후속 cleanup/reconcile 관찰 대상으로 남는다.

## Media storage cleanup

원격 object를 만드는 모든 현재 경로는 `MediaCleanupTask`에 provider/object identity를 unique key로 먼저 기록한다. Leemage 업로드는 presign 뒤 bounded PUT 전에 `uploading` intent를 저장하고, MediaAsset과 provenance를 commit하는 transaction에서 task를 `linked`로 연결한다. DB 저장 실패, 제출 실패, 만료 upload, lease 만료와 History 삭제 실패는 같은 identity의 `pending` task로 남아 cleanup worker가 재처리한다.

cleanup worker는 2초 주기, process당 동시 2개, task lease 60초를 사용한다. retry는 60초부터 exponential backoff로 최대 1시간까지 늘어나며 5회 실패하면 `failed`와 안전한 `lastError`를 남긴다. 원격 404는 성공으로 처리한다. worker는 asset usage와 generation/media output provenance를 다시 조회해 참조 중인 asset을 삭제하지 않고 task를 `linked`로 복구한다. 일반 cleanup은 unreferenced asset만 제거하며, `history_delete`는 F062 계약에 따라 원격 삭제 후 failed tombstone과 missing-reference identity를 유지한다.

운영자는 다음 상태를 DB에서 확인한다.

```sql
SELECT status, reason, COUNT(*)
FROM "MediaCleanupTask"
GROUP BY status, reason
ORDER BY status, reason;
```

`failed` row는 `lastError`, attempts, retryAt, requestId를 기준으로 storage 상태와 함께 조사한다. 원인이 해소된 뒤에는 유지보수 작업에서 `requeueFailedStorageCleanups(limit)`를 호출해 attempts를 초기화하고 재처리한다. `linked` task를 직접 삭제하거나 asset row를 직접 제거하지 않는다. 이 helper를 호출하는 운영 경로와 실제 Leemage bucket retention/versioning은 배포 환경에서 별도로 확인한다.

## Health와 관측성

운영 probe는 다음 두 endpoint를 분리해 사용한다.

- `GET /api/health/live`는 process가 HTTP를 받을 수 있는지만 확인하며 DB, storage, provider와 worker를 호출하지 않는다. 응답은 200이다.
- `GET /api/health/ready`는 PostgreSQL `SELECT 1`을 최대 2초 기다리고 supervisor의 generation/media-operation/cleanup worker가 시작·중지 상태가 아니며 heartbeat age 10초 이하인지 확인한다. 모든 조건이 맞으면 200, 하나라도 실패하면 503이다. provider 장애는 readiness 자체를 영구히 실패시키는 조건으로 사용하지 않는다.
- `GET /api/health/metrics`는 로그인 session의 `adminEmail`이 있는 경우에만 사용할 수 있다. DB queue snapshot을 읽지 못하면 503을 반환한다. 이 endpoint는 image/video/audio/media operation의 pending·processing 수, 가장 오래된 pending age, failed cleanup 수, worker 상태와 heartbeat, process-local metrics, PostgreSQL pool 상태를 반환한다.

Coolify application health check는 HTTP `GET`, host `localhost`, internal port `3000`, path `/api/health/ready`를 사용한다. interval 10초, timeout 3초, retries 6회, start period 120초로 설정한다. 설정 저장만으로 실행 중 컨테이너가 바뀌지 않으므로 다음 deploy 또는 명시적 redeploy 후 실제 health 상태를 확인한다. 모든 컨테이너가 unhealthy면 proxy가 애플리케이션 응답 대신 `404` 또는 `No available server`를 반환할 수 있으므로, 설정 직후 deployment log와 내부 probe를 함께 확인한다.

모든 middleware 대상 요청은 `X-Request-ID`를 전달한다. 값이 96자 이내의 제한된 문자 형식이면 유지하고, 그 밖의 값은 서버 UUID로 교체한다. health, external, 세 매체 generation POST와 monitoring query endpoint는 이 ID를 구조화된 완료/오류 log와 HTTP status·duration metric에 함께 기록한다. SSE 연결은 장기 응답을 일반 HTTP duration으로 오인하지 않도록 기존 stream heartbeat·fallback 경로에서 관찰한다.

HTTP metric map은 최대 64개 route key, DB operation은 16개, provider는 8개, worker failure kind는 8개로 제한한다. process uptime·memory, HTTP status bucket·duration, DB/provider duration, pool의 `total/idle/active/waiting`을 기록한다. queue depth와 oldest pending은 PostgreSQL에서 조회하는 전역 상태이고, HTTP/provider/worker counter와 pool 상태는 인스턴스별 상태다. process-local counter는 재시작 시 초기화되며 여러 인스턴스의 합계로 해석하지 않는다.

log는 JSON 한 줄의 timestamp, event와 허용된 운영 필드만 출력한다. requestId·jobId·route·provider·worker·status·duration과 오류 타입을 사용하며 request body, prompt, owner email, API key, credential, full URL과 오류 원문은 기록하지 않는다. field 길이와 줄바꿈도 제한한다.

초기 운영 경보 기준은 `/api/health/ready` 503이 3회 연속, queue `oldestPendingAgeSeconds`가 300초 초과, `failedCleanup`이 1 이상, pool `waiting`이 60초 이상 지속되는 경우다. 외부 collector·alert rule 자체는 이 저장소에 설치되어 있지 않으므로 배포 환경에서 이 응답과 로그를 수집하도록 연결한다.

간단한 probe는 다음처럼 실행한다.

```sh
curl -fsS https://<host>/api/health/live
curl -i https://<host>/api/health/ready
curl -i --cookie '<admin-session-cookie>' https://<host>/api/health/metrics
```

## 운영 확인 항목

- [ ] Coolify가 `main`, Nixpacks, Auto Deploy와 repository의 `nixpacks.toml` start command를 사용했는가
- [ ] deployment log에서 `release:migrate` 성공 뒤 Next.js server가 시작됐는가
- [ ] `/api/health/ready`가 내부 probe와 공개 endpoint에서 200이고 Coolify가 새 컨테이너를 healthy로 표시하는가
- [ ] 이전 버전 worker가 SIGTERM 이후 drain되고 35초 stop grace period 안에 종료됐는가
- [ ] SIGTERM에서 새 작업이 claim되지 않고 25초 drain 뒤 프로세스가 종료되는가
- [ ] 별도 시험 DB에서 process restart와 lease expiry 후 상태가 terminal로 수렴하는가
- [ ] Modal remote jobId가 있는 작업과 POST 직후 ID가 없는 작업의 recovery 결과를 확인했는가
- [ ] 실제 provider/storage의 원격 취소·backup·복원 정책을 코드 증거와 구분해 기록했는가
