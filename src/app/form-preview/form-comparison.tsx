"use client";
import { useState } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { ImagePlus, Sparkles, ChevronDown } from "lucide-react";
import { GenerationPromptField } from "@/shared/ui/generation-prompt-field";
import { GenerationMediaRail, useVerticalMediaRail } from "@/shared/ui/generation-media-rail";
import { AppTextarea } from "@/shared/ui/app-form-control";
import { AppButton } from "@/shared/ui/app-button";
import styles from "./comparison.module.css";
export function FormComparison() {
  const vertical = useVerticalMediaRail();
  const [media, setMedia] = useState("image");
  const [prompt, setPrompt] = useState("");
  return <main className={styles.page}>
    <header><p>LEESFIELD · SURFACE STUDY</p><h1>같은 폼, 다른 표면</h1><span>입력과 매체 선택은 두 폼에 함께 반영됩니다. 생성은 실행하지 않습니다.</span></header>
    <div className={styles.options}>
      {[false, true].map((glass) => <section key={String(glass)}>
        <div className={styles.caption}><strong>{glass ? "02 · 제안" : "01 · 현재"}</strong><span>{glass ? "프레임 전체에 고른 조명 · 회색 반투명 · 내부 입력 영역 유지" : "단색 배경 · 검은 반투명 프레임"}</span></div>
        <div className={glass ? styles.proposed : styles.current}>
          <Tabs.Root className="group/tabs" value={media} onValueChange={(value) => setMedia(String(value))} orientation={vertical ? "vertical" : "horizontal"} data-vertical={vertical ? "" : undefined} data-horizontal={!vertical ? "" : undefined}>
            <GenerationPromptField surface="hero" mediaSelector={<GenerationMediaRail />}
              attachments={<div className="px-4 pt-4"><AppButton variant="surface" size="icon" aria-label="파일 첨부 미리보기"><ImagePlus /></AppButton></div>}
              textarea={<AppTextarea surface="transparent" className="min-h-[100px]" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="어떤 장면을 만들고 싶나요?" />}
              footerLeft={<><AppButton variant="surface">{media === "audio" ? "Qwen3 TTS" : media === "video" ? "Wan 2.2" : "GPT Image 2"}<ChevronDown /></AppButton><AppButton variant="surface">{media === "audio" ? "1×" : "1:1"}<ChevronDown /></AppButton></>}
              footerRight={<AppButton variant="generate" className="min-w-28 text-base">생성 <Sparkles /></AppButton>}
            />
          </Tabs.Root>
        </div>
      </section>)}
    </div>
    <footer>02는 프레임 전체에 동일한 재질을 적용했습니다. 내부 입력 영역은 01과 같습니다.</footer>
  </main>;
}
