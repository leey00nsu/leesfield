"use client";

import { Sparkles, ImagePlus, ChevronDown } from "lucide-react";
import { AppButton } from "@/shared/ui/app-button";
import { WarpShaderPanel } from "@/shared/ui/warp-shader-panel";
import styles from "./comparison.module.css";

function PreviewButton({ variant }: { variant: "warp" | "gradient" }) {
  return (
    <AppButton variant="generate" className={styles.generate}>
      {variant === "warp" ? <><WarpShaderPanel className={styles.warp} /><span className={styles.glass} aria-hidden /></> : <span className={styles.gradient} aria-hidden />}
      <span className={styles.label}>생성 <Sparkles size={20} /></span>
    </AppButton>
  );
}

export function ButtonComparison() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p>LEESFIELD · BUTTON STUDY</p>
        <h1>생성 버튼, 두 가지 움직임</h1>
        <span>같은 폼과 크기에서 비교해 보세요. 버튼은 미리보기이며 생성 요청을 보내지 않습니다.</span>
      </header>
      <div className={styles.options}>
        {(["warp", "gradient"] as const).map((variant, index) => (
          <section key={variant} className={styles.option}>
            <div className={styles.heading}><span>0{index + 1}</span><h2>{variant === "warp" ? "일렁임 + 반투명" : "브랜드 그라데이션"}</h2></div>
            <p className={styles.description}>{variant === "warp" ? "랜딩의 흐르는 질감을 유리 표면 아래에 담았습니다." : "파란색과 밝은 하늘색이 부드럽게 오갑니다."}</p>
            <div className={styles.form}>
              <div className={styles.input}>
                <span className={styles.attachment}><ImagePlus size={20} /></span>
                <p>비 내리는 도쿄의 골목, 네온빛이 비치는 풍경</p>
                <div className={styles.settings}><span>Krea 2 <ChevronDown size={14} /></span><span>1:1 <ChevronDown size={14} /></span></div>
              </div>
              <PreviewButton variant={variant} />
            </div>
            <div className={styles.small}><span>작은 버튼에서도</span><PreviewButton variant={variant} /></div>
          </section>
        ))}
      </div>
      <footer className={styles.footer}>01 또는 02로 말씀해 주세요. 선택한 스타일을 공통 생성 버튼에 적용합니다.</footer>
    </main>
  );
}
