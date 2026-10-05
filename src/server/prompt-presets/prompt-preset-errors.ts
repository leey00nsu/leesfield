export class PromptPresetError extends Error {
  constructor(readonly code: "INVALID_REQUEST" | "PRESET_NOT_FOUND" | "PRESET_CONFLICT" | "PRESET_LIMIT_REACHED", readonly status: number) {
    super(code);
    this.name = "PromptPresetError";
  }
}
