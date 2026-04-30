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
    <div
      className="relative z-10 flex w-full items-center justify-center px-6 pt-20 text-center sm:pt-24 lg:pt-28"
      data-testid="generation-studio-intro"
    >
      <div className="mx-auto flex max-w-5xl flex-col items-center">
        <p className="mb-4 text-xs font-bold uppercase tracking-[0.24em] text-primary sm:text-sm">
          {eyebrow}
        </p>
        <h1 className="lf-serif max-w-[62rem] text-[clamp(2.35rem,4.8vw,5.15rem)] leading-[0.94] text-white/95 [text-shadow:0_0_18px_rgba(255,255,255,0.14)]">
          {title}
        </h1>
        <p className="mt-4 max-w-2xl text-[clamp(0.95rem,1.1vw,1.125rem)] font-semibold leading-relaxed text-white/58">
          {description}
        </p>
      </div>
    </div>
  );
}
