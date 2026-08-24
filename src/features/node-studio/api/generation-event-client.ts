import { parseGenerationEvent } from "@/shared/generation-events/generation-event-contract";

export type GenerationEventSource = {
  addEventListener: (
    type: string,
    listener: (event: { data: string }) => void,
  ) => void;
  close: () => void;
  onerror: (() => void) | null;
};

export type GenerationEventSourceFactory = (
  url: string,
) => GenerationEventSource | null;

export function generationEventUrl(graphId: string) {
  return `/api/generation-graphs/${encodeURIComponent(graphId)}/generation-events`;
}

export function browserGenerationEventSource(
  url: string,
): GenerationEventSource | null {
  if (typeof window === "undefined" || typeof window.EventSource === "undefined") {
    return null;
  }
  return new window.EventSource(url) as unknown as GenerationEventSource;
}

export function parseGenerationEventMessage(data: string) {
  return parseGenerationEvent(data);
}
