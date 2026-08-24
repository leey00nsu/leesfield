"use client";

import { createContext, useContext } from "react";

export type GenerationEventChannelState =
  | "connecting"
  | "connected"
  | "fallback";

const GenerationEventChannelContext =
  createContext<GenerationEventChannelState>("fallback");

export const GenerationEventChannelProviderValue =
  GenerationEventChannelContext.Provider;

export function useGenerationEventChannelState() {
  return useContext(GenerationEventChannelContext);
}
