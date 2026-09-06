"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { ComfyCurveEditor } from "./ComfyCurveEditor";
import type { ComfyAppParam } from "@/lib/comfy/types";

interface ComfyAppParametersProps {
  params: ComfyAppParam[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}

/**
 * `Sampler Steps` from `KSampler · sampler_steps`.
 *
 * The node name is noise for an ordinary widget — every setting on a KSampler
 * would repeat it. For a curve it is the opposite: `Red · Curve` and
 * `Green · Curve` are told apart by exactly the part being dropped, so those
 * keep their full label.
 */
function shortLabel(param: ComfyAppParam): string {
  if (param.type === "curve") return param.label;
  const tail = param.label.split("·").pop()?.trim();
  return tail && tail.length > 0 ? tail : param.label;
}

/**
 * Inline controls for a Comfy app's exposed widgets.
 *
 * These come from the workflow itself — App Mode selections when the author
 * curated them, otherwise the widgets the user opted into at import — so the
 * shape is only known at run time. Rendering mirrors {@link ModelParameters}
 * so a Comfy node's settings look like every other generation node's.
 */
function ComfyAppParametersInner({ params, values, onChange }: ComfyAppParametersProps) {
  const handleChange = useCallback(
    (id: string, value: unknown) => {
      const next = { ...values };
      if (value === "" || value === undefined || value === null) delete next[id];
      else next[id] = value;
      onChange(next);
    },
    [values, onChange]
  );

  // Dropdowns first, then numbers, strings, and checkboxes last — the same
  // ordering the model parameter panel uses, so the two read alike.
  const sorted = useMemo(() => {
    const weight = (param: ComfyAppParam): number => {
      if (param.enum && param.enum.length > 0) return 0;
      if (param.type === "number" || param.type === "integer") return 1;
      if (param.type === "boolean") return 3;
      return 2;
    };
    return [...params].sort((a, b) => weight(a) - weight(b));
  }, [params]);

  if (params.length === 0) {
    return <span className="text-[9px] text-neutral-500">This workflow exposes no settings</span>;
  }

  // A curve editor and a prompt box both need the full width; everything else
  // packs into the grid.
  const wide = sorted.filter((p) => p.multiline || p.type === "curve");
  const compact = sorted.filter((p) => !p.multiline && p.type !== "curve");

  return (
    <div className="shrink-0 space-y-2">
      {wide.map((param) => (
        <ComfyParameterInput
          key={param.id}
          param={param}
          value={values[param.id]}
          onChange={handleChange}
        />
      ))}
      {compact.length > 0 && (
        <div
          className={
            compact.length > 4
              ? "grid grid-cols-[repeat(auto-fill,minmax(min(180px,100%),1fr))] max-w-[420px] gap-x-6 gap-y-1.5"
              : "space-y-1.5 max-w-[280px]"
          }
        >
          {compact.map((param) => (
            <ComfyParameterInput
              key={param.id}
              param={param}
              value={values[param.id]}
              onChange={handleChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ComfyParameterInputProps {
  param: ComfyAppParam;
  value: unknown;
  onChange: (id: string, value: unknown) => void;
}

/**
 * One widget control.
 *
 * Text and number inputs keep local state while focused: React Flow re-renders
 * the whole node on every store write, which would otherwise reset the caret to
 * the end on each keystroke.
 */
function ComfyParameterInputInner({ param, value, onChange }: ComfyParameterInputProps) {
  const label = shortLabel(param);
  // Pairs each label with its control, so a screen reader announces the field
  // by name and a click on the label focuses it. Generated rather than derived
  // from `param.id`, which repeats across two nodes running the same workflow.
  const controlId = useId();
  const [local, setLocal] = useState<string>(() =>
    value === undefined || value === null ? "" : String(value)
  );
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) {
      setLocal(value === undefined || value === null ? "" : String(value));
    }
  }, [value]);

  const commit = useCallback(
    (raw: string) => {
      if (raw === "") {
        onChange(param.id, undefined);
        return;
      }
      if (param.type === "integer") {
        const parsed = parseInt(raw, 10);
        onChange(param.id, Number.isFinite(parsed) ? parsed : undefined);
        return;
      }
      if (param.type === "number") {
        const parsed = parseFloat(raw);
        onChange(param.id, Number.isFinite(parsed) ? parsed : undefined);
        return;
      }
      onChange(param.id, raw);
    },
    [onChange, param.id, param.type]
  );

  if (param.type === "curve") {
    return (
      <ComfyCurveEditor
        label={label}
        value={value ?? param.default}
        onChange={(curve) => onChange(param.id, curve)}
        {...(param.description ? { description: param.description } : {})}
      />
    );
  }

  if (param.enum && param.enum.length > 0) {
    return (
      <div className="flex items-center gap-2">
        <label
          htmlFor={controlId}
          className="text-[11px] text-neutral-400 shrink-0"
          title={param.description}
        >
          {label}
        </label>
        <select
          id={controlId}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(param.id, e.target.value || undefined)}
          className="nodrag nopan flex-1 min-w-0 text-[11px] py-1 px-2 rounded-md bg-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-neutral-600 text-white"
        >
          <option value="">
            {param.default !== undefined ? `Default (${String(param.default)})` : "Default"}
          </option>
          {param.enum.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (param.type === "boolean") {
    const checked = value !== undefined ? Boolean(value) : Boolean(param.default);
    return (
      <label
        className="flex items-center gap-1.5 text-[11px] text-neutral-300 cursor-pointer"
        title={param.description}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(param.id, e.target.checked)}
          className="nodrag nopan w-3 h-3 rounded bg-[#1a1a1a] text-neutral-600 focus:ring-1 focus:ring-neutral-600 focus:ring-offset-0"
        />
        <span>{label}</span>
      </label>
    );
  }

  if (param.multiline) {
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={controlId} className="text-[11px] text-neutral-400" title={param.description}>
          {label}
        </label>
        <textarea
          id={controlId}
          value={local}
          rows={3}
          placeholder={param.default !== undefined ? String(param.default) : undefined}
          onFocus={() => (focused.current = true)}
          onBlur={() => {
            focused.current = false;
            commit(local);
          }}
          onChange={(e) => setLocal(e.target.value)}
          className="nodrag nopan nowheel w-full text-[11px] py-1.5 px-2 rounded-md bg-[#1a1a1a] text-neutral-100 resize-none focus:outline-none focus:ring-1 focus:ring-neutral-600"
        />
      </div>
    );
  }

  const isNumber = param.type === "number" || param.type === "integer";
  let validation: string | null = null;
  if (isNumber && local !== "" && !Number.isNaN(Number(local))) {
    const num = Number(local);
    if (param.minimum !== undefined && num < param.minimum) validation = `Min: ${param.minimum}`;
    else if (param.maximum !== undefined && num > param.maximum) validation = `Max: ${param.maximum}`;
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <label
          htmlFor={controlId}
          className="text-[11px] text-neutral-400 shrink-0"
          title={param.description}
        >
          {label}
        </label>
        <div className="flex-1 min-w-0 flex items-center gap-1">
          <input
            id={controlId}
            type={isNumber ? "number" : "text"}
            value={local}
            placeholder={param.default !== undefined ? String(param.default) : undefined}
            {...(param.minimum !== undefined ? { min: param.minimum } : {})}
            {...(param.maximum !== undefined ? { max: param.maximum } : {})}
            onFocus={() => (focused.current = true)}
            onBlur={() => {
              focused.current = false;
              commit(local);
            }}
            onChange={(e) => setLocal(e.target.value)}
            className="nodrag nopan w-full text-[11px] py-1 px-2 rounded-md bg-[#1a1a1a] text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-600"
          />
          {param.isSeed && (
            <button
              type="button"
              title="Randomise this seed now"
              onClick={() => {
                const next = Math.floor(Math.random() * 1_000_000_000);
                setLocal(String(next));
                onChange(param.id, next);
              }}
              className="nodrag nopan shrink-0 text-neutral-500 hover:text-neutral-200 transition-colors"
            >
              <svg
                className="w-3 h-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 2v6h-6" />
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                <path d="M3 22v-6h6" />
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {validation && <span className="text-[9px] text-amber-400 pl-1">{validation}</span>}
    </div>
  );
}

const ComfyParameterInput = React.memo(ComfyParameterInputInner);
export const ComfyAppParameters = React.memo(ComfyAppParametersInner);
