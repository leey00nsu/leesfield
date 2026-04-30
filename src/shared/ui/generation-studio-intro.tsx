type GenerationStudioIntroProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export function GenerationStudioIntro({
  eyebrow,
  title,
  description,
}: GenerationStudioIntroProps) {
  return (
    <div className="relative z-10 flex h-full min-h-[46vh] w-full items-center justify-center px-6 py-16 text-center sm:min-h-[58vh]">
      <div className="mx-auto flex max-w-6xl flex-col items-center">
        <p className="mb-5 text-xs font-bold uppercase tracking-[0.24em] text-primary sm:text-sm">
          {eyebrow}
        </p>
        <h1 className="lf-serif max-w-[72rem] text-[clamp(3.1rem,7vw,7rem)] leading-[0.92] text-white/95 [text-shadow:0_0_22px_rgba(255,255,255,0.16)]">
          {title}
        </h1>
        <p className="mt-6 max-w-3xl text-[clamp(1rem,1.45vw,1.35rem)] font-semibold leading-relaxed text-white/56">
          {description}
        </p>
      </div>
    </div>
  );
}
