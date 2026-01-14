import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from "react";

export interface InitImagePreview {
  id: string;
  url: string;
  dataUrl: string;
}

export interface UseImageInitPreviewsOptions {
  maxInputImages: number;
  onChange: (dataUrls: string[]) => void;
}

export interface UseImageInitPreviewsResult {
  previews: InitImagePreview[];
  canUpload: boolean;
  inputRef: RefObject<HTMLInputElement>;
  openPicker: () => void;
  handleFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  removeImage: (id: string) => void;
  reset: () => void;
}

export function useImageInitPreviews({
  maxInputImages,
  onChange,
}: UseImageInitPreviewsOptions): UseImageInitPreviewsResult {
  const [previews, setPreviews] = useState<InitImagePreview[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const canUpload = maxInputImages > 0;

  const syncFormValue = useCallback(
    (next: InitImagePreview[]) => {
      onChange(next.map((item) => item.dataUrl));
    },
    [onChange],
  );

  useEffect(() => {
    setPreviews((prev) => {
      if (!canUpload) {
        if (prev.length === 0) return prev;
        syncFormValue([]);
        if (inputRef.current) {
          inputRef.current.value = "";
        }
        return [];
      }
      if (prev.length > maxInputImages) {
        const trimmed = prev.slice(0, maxInputImages);
        syncFormValue(trimmed);
        return trimmed;
      }
      return prev;
    });
  }, [canUpload, maxInputImages, syncFormValue]);

  const openPicker = useCallback(() => {
    if (!canUpload || previews.length >= maxInputImages) {
      return;
    }
    inputRef.current?.click();
  }, [canUpload, maxInputImages, previews.length]);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (!files.length || !canUpload) {
        event.target.value = "";
        return;
      }

      const remaining = Math.max(0, maxInputImages - previews.length);
      const selected = files.slice(0, remaining);

      const dataUrls = await Promise.all(
        selected.map(
          (file) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () =>
                reject(new Error("이미지 업로드에 실패했습니다."));
              reader.readAsDataURL(file);
            }),
        ),
      );

      const next = [
        ...previews,
        ...dataUrls.map((dataUrl) => ({
          id: crypto.randomUUID(),
          url: dataUrl,
          dataUrl,
        })),
      ];

      setPreviews(next);
      syncFormValue(next);

      event.target.value = "";
    },
    [canUpload, maxInputImages, previews, syncFormValue],
  );

  const removeImage = useCallback(
    (id: string) => {
      setPreviews((prev) => {
        const next = prev.filter((item) => item.id !== id);
        syncFormValue(next);
        return next;
      });
    },
    [syncFormValue],
  );

  const reset = useCallback(() => {
    setPreviews([]);
    syncFormValue([]);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, [syncFormValue]);

  return {
    previews,
    canUpload,
    inputRef,
    openPicker,
    handleFileChange,
    removeImage,
    reset,
  };
}
