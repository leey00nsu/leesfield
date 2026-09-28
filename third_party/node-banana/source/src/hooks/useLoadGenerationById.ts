import { useCallback } from "react";
import { useWorkflowStore } from "@/store/workflowStore";

/**
 * Returns a loader that fetches a previously-generated asset by ID from the
 * configured generations folder via POST /api/load-generation.
 *
 * @param resultField preferred key on the response payload (e.g. "image",
 *   "video", "audio"); falls back to `result.image` when absent.
 * @param label capitalized media label used in log messages (e.g. "Image").
 */
export function useLoadGenerationById(resultField: string, label: string) {
  const generationsPath = useWorkflowStore((state) => state.generationsPath);

  return useCallback(
    async (id: string): Promise<string | null> => {
      if (!generationsPath) {
        console.error("Generations path not configured");
        return null;
      }

      try {
        const response = await fetch("/api/load-generation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            directoryPath: generationsPath,
            imageId: id,
          }),
        });

        const result = await response.json();
        if (!result.success) {
          // Missing assets are expected when refs point to deleted/moved files
          console.log(`${label} not found: ${id}`);
          return null;
        }
        return result[resultField] || result.image;
      } catch (error) {
        console.warn(`Error loading ${label.toLowerCase()}:`, error);
        return null;
      }
    },
    [generationsPath, resultField, label]
  );
}
