# 모델 카탈로그 가이드

모델 정의/파라미터는 DB의 모델 카탈로그에서 **JSON 구조로 저장**됩니다.  
관리 화면에서 등록/수정한 설정이 생성 요청과 검증에 사용됩니다.

## JSON 스키마 요약

- **type**: `image` | `video`
- **key / label / vendor / provider**
- **providerConfig**: `hf_space` 설정 (예: `space_id`, `api_name`, `timeout_ms`)
- **parameters**: UI 및 검증 파라미터 정의
- **meta**: 기본값/제약/모달리티 정보

## parameters (UI/검증)

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

## meta (기본값/제약)

`meta`는 모델별 기본값/제약 정보를 제공합니다.

- 이미지: `default_width`, `default_height`, `default_steps`, `concurrent_limit`, `max_input_images`
- 비디오: `default_width`, `default_height`, `default_duration_sec`, `default_fps`, `default_steps`, `default_guidance_scale`, `concurrent_limit`, `supports_init_image`

## UI 구분 규칙

- `parameters.{field}.ui === "hidden"`이면 해당 입력 UI를 숨깁니다.
- `options`가 있는 경우 `select`/`card` 선택 UI로 렌더링됩니다.
- 기본값은 `parameters.{field}.default` → 없으면 `meta.default_*` → 공통 fallback 순으로 결정됩니다.

## 모달리티 배지 기준

- **이미지**: `max_input_images > 0` 이면 `I2I` 추가, 기본은 `T2I`
- **비디오**: `supports_init_image` 또는 `i2v_model_id`가 있으면 `I2V`, `t2v_model_id`가 있으면 `T2V`

## 스키마 확장 가이드

JSON 구조를 확장할 때는 아래를 함께 갱신하세요.

- 스키마 검증: `src/server/model-catalog/catalog-schema.ts`
- 런타임 기본값/제약: `src/server/model-catalog/runtime-models.ts`
- UI/검증 규칙: `src/shared/model-catalog/runtime-utils.ts`, `src/shared/model-catalog/runtime-schema.ts`
- 모달리티 규칙: `src/shared/model-catalog/modality.ts`
