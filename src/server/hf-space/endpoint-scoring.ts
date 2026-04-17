type EndpointScoringParameter = {
  parameter_name?: string;
  label?: string;
};

type EndpointScoringEndpoint = {
  parameters?: EndpointScoringParameter[];
};

export function hasAudioEndpointSignal(
  endpoint: EndpointScoringEndpoint | undefined,
) {
  const parameters = endpoint?.parameters ?? [];
  return parameters.some((parameter) => {
    const rawTargets = [parameter.parameter_name ?? "", parameter.label ?? ""]
      .map((value) => value.toLowerCase().trim())
      .filter(Boolean);
    const normalizedTargets = rawTargets.map((value) => value.replace(/[_-]+/g, " "));
    const tokenLists = normalizedTargets.map((value) =>
      value.split(/[^a-z0-9]+/).filter(Boolean),
    );
    const hasSpeedSignal = tokenLists.some((tokens) => tokens.includes("speed"));
    const hasStandaloneRate = normalizedTargets.some((value) => value === "rate");
    const hasExplicitAudioRate = normalizedTargets.some((value) =>
      /\b(audio|speech|voice)\s+rate\b/.test(value),
    );
    const target = normalizedTargets.join(" ");
    return (
      target.includes("reference audio") ||
      target.includes("ref audio") ||
      target.includes("ref_audio") ||
      target.includes("input audio") ||
      target.includes("input_audio") ||
      target.includes("voice") ||
      target.includes("speaker") ||
      target.includes("spk") ||
      hasSpeedSignal ||
      hasStandaloneRate ||
      hasExplicitAudioRate
    );
  });
}

export function scoreEndpointCandidate(
  apiName: string,
  endpoint: EndpointScoringEndpoint | undefined,
  outputTypes: string[],
) {
  const normalizedName = apiName.toLowerCase();
  const parameters = endpoint?.parameters ?? [];
  let score = 0;

  if (outputTypes.some((type) => type.includes("audio"))) {
    score += 10;
  }
  if (hasAudioEndpointSignal(endpoint)) {
    score += 10;
  }
  if (
    normalizedName.includes("run") ||
    normalizedName.includes("generate") ||
    normalizedName.includes("predict") ||
    normalizedName.includes("synth")
  ) {
    score += 10;
  }
  if (
    normalizedName.includes("toggle") ||
    normalizedName.includes("refresh") ||
    normalizedName.includes("load")
  ) {
    score -= 10;
  }

  for (const parameter of parameters) {
    const target = `${parameter.parameter_name ?? ""} ${parameter.label ?? ""}`.toLowerCase();
    if (target.includes("prompt") || target.includes("text")) score += 2;
    if (
      target.includes("reference audio") ||
      target.includes("ref audio") ||
      target.includes("ref_audio")
    ) {
      score += 4;
    }
  }

  return score;
}
