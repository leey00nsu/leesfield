"use client";
import { createContext, useContext } from "react";
import { useSearchParams } from "next/navigation";
export const GenerationQueryContext = createContext<URLSearchParams | null>(
  null,
);
export function useGenerationSearchParams() {
  const query = useSearchParams();
  return useContext(GenerationQueryContext) ?? query;
}
