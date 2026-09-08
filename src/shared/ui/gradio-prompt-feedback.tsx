"use client";
import { useLocale } from "next-intl";
import type { GradioContract } from "@/shared/model-catalog/gradio-contract";
import { gradioFormMessage } from "@/shared/model-catalog/gradio-form-validation";
export function GradioPromptFeedback({contract}:{contract:GradioContract}) {
 const locale=useLocale();
 const name=contract.inputs.find(field=>field.canonical==="prompt")?.name ?? "prompt";
 return <p role="alert" className="text-xs text-destructive">{gradioFormMessage("HF_CONTRACT_REQUIRED:"+name,contract,locale)}</p>;
}
