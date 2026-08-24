"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";

import type { GenerationGraphSummaryDto } from "../model/graph-types";

type GraphSelectorProps = {
  graphs: GenerationGraphSummaryDto[];
  selectedGraphId: string | null;
  disabled?: boolean;
  creating?: boolean;
  onSelect: (graphId: string) => void;
  onCreate: (title: string) => void;
};

export function GraphSelector({
  graphs,
  selectedGraphId,
  disabled,
  creating,
  onSelect,
  onCreate,
}: GraphSelectorProps) {
  const t = useTranslations("nodeStudio");
  const [title, setTitle] = useState("");

  const submit = () => {
    const normalized = title.trim();
    if (!normalized) return;
    onCreate(normalized);
    setTitle("");
  };

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="node-studio-graph-selector">
        {t("graph.selector")}
      </label>
      <select
        id="node-studio-graph-selector"
        value={selectedGraphId ?? ""}
        disabled={disabled || graphs.length === 0}
        onChange={(event) => onSelect(event.target.value)}
        className="h-11 min-w-44 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-primary disabled:opacity-50"
      >
        {graphs.length === 0 ? <option value="">{t("graph.none")}</option> : null}
        {graphs.map((graph) => (
          <option key={graph.id} value={graph.id}>
            {graph.title}
          </option>
        ))}
      </select>

      <div className="flex min-w-60 flex-1 items-center gap-2 sm:max-w-md">
        <AppInput
          value={title}
          maxLength={120}
          disabled={creating}
          placeholder={t("graph.createPlaceholder")}
          aria-label={t("graph.createPlaceholder")}
          className="h-11 rounded-xl"
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
        />
        <AppButton
          type="button"
          size="icon"
          className="h-11 w-11 shrink-0"
          disabled={creating || title.trim().length === 0}
          aria-label={t("actions.createGraph")}
          onClick={submit}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </AppButton>
      </div>
    </div>
  );
}
