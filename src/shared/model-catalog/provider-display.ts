/** Display the execution provider consistently without exposing adapter keys. */
export function modelProviderLabel(provider: string): string {
  const labels: Record<string,string> = {hf_space:"Hugging Face",modal_comfyui:"Modal",codex_bridge:"Codex Bridge",codex_cli:"Codex CLI",openai_compatible:"API",openai:"OpenAI",fal:"fal.ai",replicate:"Replicate",kie:"Kie.ai",wavespeed:"WaveSpeed",gemini:"Gemini"};
  return labels[provider] ?? provider;
}
