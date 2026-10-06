import type { GradioField } from "./gradio-contract";

/** Gradio selection api_info hardcodes string even for numeric choices.
 * Only imported selection metadata authorizes this correction; raw schema stays stored.
 */
export function gradioChoiceSchema(field: GradioField): Record<string, unknown> {
  if (!field.choiceMode) return field.schema;
  const types = [...new Set((field.choices ?? []).map(value => typeof value))];
  if (field.allowCustomValue || !types.length) {
    if (!types.includes("string")) types.push("string");
    if (field.allowCustomValue && !types.includes("number")) types.push("number");
  }
  const scalar = (schema: Record<string, unknown>) => {
    const projected: Record<string, unknown> = { ...schema, type: types.length === 1 ? types[0] : types };
    if (field.allowCustomValue) delete projected.enum;
    else if (field.choices) projected.enum = field.choices;
    return projected;
  };
  if (field.choiceMode === "single") return scalar(field.schema);
  const items = field.schema.items;
  return { ...field.schema, ...(field.maxChoices !== undefined ? { maxItems: typeof field.schema.maxItems === "number" ? Math.min(field.schema.maxItems, field.maxChoices) : field.maxChoices } : {}), type: "array", items: scalar(items && typeof items === "object" && !Array.isArray(items) ? items as Record<string, unknown> : {}) };
}
