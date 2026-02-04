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
  inputRef: RefObject<HTMLInputElement | null>;
  openPicker: () => void;
  handleFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  replaceImages: (sources: string[]) => void;
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
    // 업로드 제한 변경 시 프리뷰/폼 값이 어긋나지 않도록 동기화한다.
    setPreviews((prev) => {
      if (!canUpload) {
        if (prev.length === 0) return prev;
        // 업로드 불가 전환 시 파일 선택과 폼 값을 함께 초기화한다.
        syncFormValue([]);
        if (inputRef.current) {
          inputRef.current.value = "";
        }
        return [];
      }
      if (prev.length > maxInputImages) {
        // 제한 축소 시 초과 프리뷰를 잘라내고 폼 값을 맞춘다.
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

  const replaceImages = useCallback(
    (sources: string[]) => {
      if (!canUpload) {
        setPreviews([]);
        syncFormValue([]);
        if (inputRef.current) {
          inputRef.current.value = "";
        }
        return;
      }

      const resolved = sources
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .slice(0, maxInputImages);

      const next = resolved.map((value) => ({
        id: crypto.randomUUID(),
        url: value,
        dataUrl: value,
      }));

      setPreviews(next);
      syncFormValue(next);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    },
    [canUpload, maxInputImages, syncFormValue],
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
    replaceImages,
    removeImage,
    reset,
  };
}
