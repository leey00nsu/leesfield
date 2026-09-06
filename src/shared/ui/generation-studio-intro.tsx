import { ProductPageIntro } from "@/shared/ui/brand/product-page-intro/product-page-intro";

type GenerationStudioIntroProps = { eyebrow: string; title: string; description: string; compact?: boolean; guidance?: string };
export function GenerationStudioIntro({ compact, guidance, ...props }: GenerationStudioIntroProps) {
  if (compact) return <p data-testid="generation-studio-intro" className="text-center text-sm leading-6 text-muted-foreground">{guidance}</p>;
  return <ProductPageIntro {...props} data-testid="generation-studio-intro" className="relative z-10 justify-center text-center [&>div]:flex [&>div]:flex-col [&>div]:items-center" />;
}
