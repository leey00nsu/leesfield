
export function gradioDiagnosticMessage(reason:string, locale:string) {
 const [code,field]=reason.split(":");
 const messages:Record<string,[string,string]>={
  OPTIONAL_LABEL_REVIEW:["화면에는 선택 입력으로 표시되지만 API에는 생략 또는 null 허용이 명시되지 않았습니다.","Marked optional in the UI, but the API does not declare omission or null support."],
  SCHEMA_MISSING:["원본 입력 스키마를 찾지 못했습니다.","The original input schema is unavailable."],
  OUTPUT_MEDIA_UNRESOLVED:["출력 미디어 유형과 결과 위치를 선택하세요.","Select the output media type and result path."],
  OUTPUT_SELECTION_REVIEW:["여러 반환값 중 사용할 출력을 선택하세요.","Select which returned output to use."],
  PROMPT_BINDING_REVIEW:["필요하면 프롬프트 입력을 연결하세요. 원본 키로도 입력할 수 있습니다.","Optionally bind the prompt input. Original parameter keys remain usable."],
  SESSION_STATE_INPUT:["세션 상태가 필요한 입력은 현재 실행 경로에서 지원하지 않습니다.","Session-state inputs are not supported by the current execution path."],
  INPUT_SCHEMA_MISSING:["입력 스키마가 없어 자동 매핑할 수 없습니다.","The input schema is missing, limiting automatic mapping."],
  SCHEMA_MAPPING_LIMIT:["이 스키마는 현재 매핑 구현에서 해석하지 못했습니다.","The current mapper cannot interpret this schema."],
  DEFAULT_SCHEMA_CONFLICT:["공개 기본값과 입력 스키마가 충돌합니다.","The published default conflicts with its input schema."],
  NESTED_FILE_CONVERSION:["중첩된 파일 입력 변환은 아직 구현되지 않았습니다.","Nested file input conversion is not implemented."],
  ENDPOINT_PURPOSE_REVIEW:["선택한 API가 원하는 생성 작업인지 확인하세요.","Check that the selected API performs the intended generation task."],
 };
 const message=messages[code]?.[locale==="ko"?0:1];
 return message ? (field?field+": ":"")+message : (locale==="ko"?"설정 확인: ":"Configuration check: ")+reason;
}
