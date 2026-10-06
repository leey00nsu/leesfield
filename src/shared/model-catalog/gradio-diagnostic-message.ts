
export function gradioDiagnosticMessage(reason:string, locale:string) {
 const [code,...parts]=reason.split(":");
 const keyword=code==="HF_CONTRACT_SCHEMA"?parts.pop():undefined;
 const field=parts.join(":");
 const messages:Record<string,[string,string]>={
  PARAMETER_TYPE:["기본값의 타입이 입력 타입과 다릅니다.","The default value has the wrong input type."],
  PARAMETER_NULL:["null 기본값을 사용하려면 nullable을 허용하세요.","Allow nullable to use a null default."],
  PARAMETER_OPTION:["기본값을 선택값에 포함하거나 custom 선택을 허용하세요.","Include the default in the choices or allow custom values."],
  PARAMETER_RANGE:["기본값과 최소·최대 범위를 확인하세요.","Check the default and minimum/maximum range."],
  PARAMETER_STEP:["양수 step과 기본값의 간격을 확인하세요.","Check the positive step and the default's step alignment."],
  FILE_MEDIA_UNRESOLVED:["binding.media에 입력 파일 유형(image/video/audio)을 지정하세요.","Specify the input file type (image/video/audio) in binding.media."],
  HF_CONTRACT_RULES_MAPPING_LIMITED:["기본값을 채운 조건을 공개 schema에 표현할 수 없습니다. 이 루트 제약을 조건·필드 규칙으로 바꾸세요.","This root constraint cannot be published with filled defaults. Use conditions and field rules."],
  HF_CONTRACT_RULES_UNKNOWN_PARAMETER:["input_rules에서 선언된 입력 이름을 사용하세요.","Use a declared input name in input_rules."],
  HF_CONTRACT_SCHEMA:["입력값이 schema 제약을 위반합니다.","The input violates a schema constraint."],
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
 return message ? (field?field+": ":"")+message+(code==="HF_CONTRACT_SCHEMA"&&keyword ? " ("+keyword+")" : "") : (locale==="ko"?"설정 확인: ":"Configuration check: ")+reason;
}
