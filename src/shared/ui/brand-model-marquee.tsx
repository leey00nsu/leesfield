"use client";
import styles from "./brand-model-marquee.module.css";
import Image from "next/image";
import { motion, useTime, useTransform, type MotionValue } from "motion/react";
import { useAppReducedMotion } from "@/shared/lib/use-app-reduced-motion";
import models from "@/shared/config/brand-models.json";

// Shared artwork (Wan / Z-Image) occupies one slot, as in the landing flip.
const logos = models.filter((model, index, all) =>
  all.findIndex((item) => item.logo === model.logo) === index,
);

function MarqueeItem({ model, index, time, reduced }: { model: typeof logos[number]; index: number; time: MotionValue<number>; reduced: boolean }) {
  const phase = useTransform(time, value => ((value / 18000 + index / logos.length) % 1));
  const left = useTransform(phase, [0, 1], ["115%", "-15%"]);
  const scale = useTransform(phase, [0, .25, .5, .75, 1], [.65, .8, 1.3, .8, .65]);
  const filter = useTransform(phase, [0, .25, .5, .75, 1], ["blur(5px)", "blur(2px)", "blur(0px)", "blur(2px)", "blur(5px)"]);
  const opacity = useTransform(phase, [0, .25, .5, .75, 1], [.25, .65, 1, .65, .25]);
  return <motion.div className={styles.item} style={reduced ? { left: "auto", scale: 1, filter: "none", opacity: 1, x: 0, y: 0 } : { left, scale, filter, opacity, x: "-50%", y: "-50%" }}>
    <Image src={model.logo} alt="" width={80} height={80} unoptimized className="size-full rounded-xl object-contain" />
  </motion.div>;
}
export function BrandModelMarquee() {
  const time = useTime();
  const reduced = useAppReducedMotion();
  return (
    <div className={styles.marquee} aria-hidden="true">
      {logos.map((model, index) => (
        <MarqueeItem key={model.logo} model={model} index={index} time={time} reduced={reduced} />
      ))}
    </div>
  );
}
