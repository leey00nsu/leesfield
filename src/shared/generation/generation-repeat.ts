export const MAX_GENERATION_REPETITIONS = 100;
export const isGenerationRepeatCount = (value: number) =>
  Number.isSafeInteger(value) && value >= 1 && value <= MAX_GENERATION_REPETITIONS;
