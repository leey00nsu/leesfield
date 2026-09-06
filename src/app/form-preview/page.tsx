import { notFound } from "next/navigation";
import { FormComparison } from "./form-comparison";
export default function FormPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <FormComparison />;
}
