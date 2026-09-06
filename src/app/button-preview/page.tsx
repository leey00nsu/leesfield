import { notFound } from "next/navigation";
import { ButtonComparison } from "./button-comparison";

export default function ButtonPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ButtonComparison />;
}
