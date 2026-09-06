"use client";
import { useLandingReducedMotion as useReducedMotion } from "./use-landing-reduced-motion";
// Source: https://ui.aceternity.com/components/terminal (2026-09-06).
// Landing adaptation: audio removed, reduced-motion static transcript.

import React, { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/shared/lib/utils";

function useInView(ref: React.RefObject<HTMLElement | null>, once = true) {
  const [inView, setInView] = useState(false);
  const triggered = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || (once && triggered.current)) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !triggered.current) {
          setInView(true);
          if (once) {
            triggered.current = true;
            observer.disconnect();
          }
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, once]);

  return inView;
}

type TokenType =
  | "command"
  | "flag"
  | "string"
  | "number"
  | "operator"
  | "path"
  | "variable"
  | "comment"
  | "default";

interface Token {
  type: TokenType;
  value: string;
}

function tokenizeJavascript(text: string): Token[] {
  return text
    .split(
      /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b(?:const|let|await|new|return|async)\b|\b\d+\b)/g,
    )
    .filter(Boolean)
    .map((value) => ({
      value,
      type: /^["']/.test(value)
        ? "string"
        : /^(const|let|await|new|return|async)$/.test(value)
          ? "command"
          : /^\d+$/.test(value)
            ? "number"
            : "default",
    }));
}

const tokenColors: Record<TokenType, string> = {
  command: "text-emerald-400",
  flag: "text-sky-400",
  string: "text-amber-300",
  number: "text-purple-400",
  operator: "text-red-400",
  path: "text-cyan-300",
  variable: "text-pink-400",
  comment: "text-neutral-500",
  default: "text-neutral-300",
};

function SyntaxHighlightedText({ text }: { text: string }) {
  const tokens = tokenizeJavascript(text);

  return (
    <>
      {tokens.map((token, i) => (
        <span key={i} className={tokenColors[token.type]}>
          {token.value}
        </span>
      ))}
    </>
  );
}

interface TerminalLine {
  type: "command" | "output";
  content: string;
}

export interface TerminalProps {
  commands: string[];
  outputs?: Record<number, string[]>;
  className?: string;
  typingSpeed?: number;
  delayBetweenCommands?: number;
  initialDelay?: number;
}

export function Terminal({
  commands = ["npx shadcn@latest init"],
  outputs = {},
  className,
  typingSpeed = 50,
  delayBetweenCommands = 800,
  initialDelay = 500,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef);
  const reduced = useReducedMotion();

  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [currentText, setCurrentText] = useState("");
  const [commandIdx, setCommandIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [outputIdx, setOutputIdx] = useState(-1);
  const [phase, setPhase] = useState<
    "idle" | "typing" | "executing" | "outputting" | "pausing" | "done"
  >("idle");
  const [cursorVisible, setCursorVisible] = useState(true);

  const currentCommand = commands[commandIdx] || "";
  const currentOutputs = useMemo(
    () => outputs[commandIdx] || [],
    [outputs, commandIdx],
  );
  const isLastCommand = commandIdx === commands.length - 1;

  useEffect(() => {
    if (reduced || !inView || phase !== "idle") return;
    const t = setTimeout(() => setPhase("typing"), initialDelay);
    return () => clearTimeout(t);
  }, [inView, phase, initialDelay, reduced]);

  useEffect(() => {
    if (reduced || phase !== "typing") return;

    if (charIdx < currentCommand.length) {
      const t = setTimeout(
        () => {
          setCurrentText(currentCommand.slice(0, charIdx + 1));
          setCharIdx((c) => c + 1);
        },
        typingSpeed + Math.random() * 30,
      );
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => {
        setPhase("executing");
      }, 80);
      return () => clearTimeout(t);
    }
  }, [phase, charIdx, currentCommand, typingSpeed, reduced]);

  useEffect(() => {
    if (phase !== "executing") return;

    // Preserve the upstream terminal phase machine; this effect commits one completed command.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLines((prev) => [...prev, { type: "command", content: currentCommand }]);
    setCurrentText("");

    if (currentOutputs.length > 0) {
      setOutputIdx(0);
      setPhase("outputting");
    } else if (isLastCommand) {
      setPhase("done");
    } else {
      setPhase("pausing");
    }
  }, [phase, currentCommand, currentOutputs.length, isLastCommand]);

  useEffect(() => {
    if (phase !== "outputting") return;

    if (outputIdx >= 0 && outputIdx < currentOutputs.length) {
      const t = setTimeout(() => {
        setLines((prev) => [
          ...prev,
          { type: "output", content: currentOutputs[outputIdx] },
        ]);
        setOutputIdx((i) => i + 1);
      }, 150);
      return () => clearTimeout(t);
    } else if (outputIdx >= currentOutputs.length) {
      const t = setTimeout(() => {
        if (isLastCommand) {
          setPhase("done");
        } else {
          setPhase("pausing");
        }
      }, 300);
      return () => clearTimeout(t);
    }
  }, [phase, outputIdx, currentOutputs, isLastCommand]);

  useEffect(() => {
    if (phase !== "pausing") return;
    const t = setTimeout(() => {
      setCharIdx(0);
      setOutputIdx(-1);
      setCommandIdx((c) => c + 1);
      setPhase("typing");
    }, delayBetweenCommands);
    return () => clearTimeout(t);
  }, [phase, delayBetweenCommands]);

  useEffect(() => {
    if (reduced || phase !== "done") return;
    const timer = setTimeout(() => {
      setLines([]);
      setCommandIdx(0);
      setCharIdx(0);
      setOutputIdx(-1);
      setCurrentText("");
      setPhase("typing");
    }, 4000);
    return () => clearTimeout(timer);
  }, [phase, reduced]);

  useEffect(() => {
    if (reduced) return;
    const interval = setInterval(() => setCursorVisible((v) => !v), 530);
    return () => clearInterval(interval);
  }, [reduced]);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [lines, phase]);

  return (
    <div
      ref={containerRef}
      data-terminal-phase={phase}
      className={cn(
        "mx-auto w-full max-w-xl px-4 font-mono text-xs",
        className,
      )}
    >
      <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 shadow-2xl">
        {/* Title Bar */}
        <div className="flex items-center gap-2 bg-neutral-800 px-4 py-3">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-500 transition-colors hover:bg-red-600" />
            <div className="h-3 w-3 rounded-full bg-yellow-500 transition-colors hover:bg-yellow-600" />
            <div className="h-3 w-3 rounded-full bg-green-500 transition-colors hover:bg-green-600" />
          </div>
        </div>

        {/* Terminal Content */}
        <div
          ref={contentRef}
          className="no-visible-scrollbar h-80 overflow-y-auto break-all p-4 font-mono"
        >
          {(reduced
            ? commands.flatMap((content, index): TerminalLine[] => [
                { type: "command", content },
                ...(outputs[index] ?? []).map((content) => ({
                  type: "output" as const,
                  content,
                })),
              ])
            : lines
          ).map((line, i) => (
            <div key={i} className="leading-relaxed whitespace-pre-wrap">
              {line.type === "command" ? (
                <span>
                  <SyntaxHighlightedText text={line.content} />
                </span>
              ) : (
                <span className="text-neutral-400">{line.content}</span>
              )}
            </div>
          ))}

          {phase === "typing" && (
            <div className="leading-relaxed whitespace-pre-wrap">
              <SyntaxHighlightedText text={currentText} />
              <span className="ml-0.5 inline-block h-4 w-2 bg-neutral-300 align-middle" />
            </div>
          )}

          {(phase === "done" ||
            phase === "pausing" ||
            phase === "outputting") && (
            <div className="leading-relaxed whitespace-pre-wrap">
              <span
                className={cn(
                  "inline-block h-4 w-2 bg-neutral-300 align-middle transition-opacity duration-100",
                  !cursorVisible && "opacity-0",
                )}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
