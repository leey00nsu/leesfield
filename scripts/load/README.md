# Production readiness load scenarios

이 디렉터리의 부하는 실제 운영 URL을 기본 대상으로 삼지 않는다. k6는 `LOAD_CONFIRM=YES`가 없으면 시작하지 않고, loopback이 아닌 대상은 `LOAD_ALLOW_NONLOCAL=YES`를 추가로 요구한다. 유료 provider나 storage를 호출하는 생성 부하는 포함하지 않는다.

## k6

기본 경로는 History·Model·Monitoring 읽기 API를 40%·40%·20%로 섞는다. 인증된 읽기 경로를 측정하려면 세션 cookie를 환경변수로 전달한다. cookie와 URL은 출력 결과에 포함하지 않는다.

```sh
LOAD_CONFIRM=YES \
LOAD_TARGET=http://127.0.0.1:3000 \
LOAD_AUTH_COOKIE='<local-admin-session-cookie>' \
k6 run scripts/load/production-readiness.k6.js
```

기본 `smoke` profile은 10 RPS 5초, 5초 회복, 50 RPS 5초, 5초 회복, 100 RPS 5초를 실행하고 500건 burst를 보낸다. `LOAD_PROFILE=full`은 각 구간을 2분, 회복 구간을 30초로 늘린다. 실제 판정에는 p95/p99, 예상 밖 5xx, 429, 503, 인증 오류, dropped iterations, RSS·event-loop delay, DB pool/queue/worker 회복을 함께 기록한다. 401/403은 테스트 설정 오류로 실패 처리하고, 429와 503은 별도 admission 결과로 집계한다. 10 RPS 기준은 p95 1초 미만·예상 밖 5xx 1% 미만·dropped 0이며, 50/100 RPS와 burst는 측정 결과로 기록한다.

기본 경로를 다른 격리 API로 바꿀 때는 path만 지정한다.

```sh
LOAD_CONFIRM=YES \
LOAD_HISTORY_PATH='/api/history?limit=20' \
LOAD_MODEL_PATH='/api/models' \
LOAD_MONITORING_PATH='/api/monitoring/stats' \
k6 run scripts/load/production-readiness.k6.js
```

## 로컬 stub smoke

`pnpm load:stub-smoke`는 외부 네트워크·DB·provider 없이 loopback HTTP stub에 10/50/100 RPS와 500건 burst를 실행해 부하 harness 자체와 latency 요약 형식을 확인한다. 이 결과는 애플리케이션 처리 용량의 실측으로 해석하지 않는다.

```sh
pnpm load:stub-smoke
```

실제 앱의 부하는 인증된 격리 환경에서만 실행하고, provider/storage URL이 설정된 환경에서는 이 시나리오를 사용하지 않는다.
