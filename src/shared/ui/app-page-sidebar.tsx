"use client";

import { useId, useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { AppButton } from "./app-button";

export function AppPageSidebar({ title, navigationLabel, toggleLabel, navigationId, children }: {
  title: ReactNode;
  navigationLabel: string;
  toggleLabel: string;
  navigationId?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [toggle, setToggle] = useState<HTMLButtonElement | null>(null);
  const generatedId = useId();
  const id = navigationId ?? generatedId;
  function close() {
    setOpen(false);
    if (toggle && window.getComputedStyle(toggle).display !== "none") toggle.focus();
  }
  return <aside className="min-w-0 border-b border-border pb-4 lg:sticky lg:top-6 lg:flex lg:h-[calc(100dvh-9rem)] lg:flex-col lg:self-start lg:border-r lg:border-b-0 lg:pr-5 lg:pb-0">
    <div className="flex items-center justify-between gap-2 lg:mb-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <AppButton ref={setToggle} size="icon-sm" variant="ghost" className="lg:hidden" aria-label={toggleLabel} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><Menu className="size-4" /></AppButton>
    </div>
    <nav id={id} aria-label={navigationLabel} onKeyDown={event => {
      if (event.key === "Escape" && open) { event.stopPropagation(); close(); }
    }} className={cn("app-scrollbar mt-3 min-h-0 min-w-0 flex-col gap-5 overflow-y-auto lg:mt-0 lg:flex", open ? "flex" : "hidden")}>
      {children(close)}
    </nav>
  </aside>;
}
