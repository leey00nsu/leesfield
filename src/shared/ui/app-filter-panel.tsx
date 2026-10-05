"use client";
import { useEffect, useState, type ReactNode } from "react";
import { ListFilter } from "lucide-react";
import { Button } from "@/shared/ui/brand/button/button";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter, SheetClose } from "@/shared/ui/brand/sheet/sheet";

export function AppFilterPanel({ children, title, description, applyLabel }: {
  children: ReactNode; title: string; description: string; applyLabel: string;
}) {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia("(max-width: 639px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  if (!mobile) return <div role="group" aria-label={title}>{children}</div>;
  return <Sheet>
    <SheetTrigger render={<Button variant="outline" />}><ListFilter />{title}</SheetTrigger>
    <SheetContent side="bottom">
      <SheetHeader><SheetTitle>{title}</SheetTitle><SheetDescription>{description}</SheetDescription></SheetHeader>
      <div className="px-4 py-5">{children}</div>
      <SheetFooter><SheetClose render={<Button />}>{applyLabel}</SheetClose></SheetFooter>
    </SheetContent>
  </Sheet>;
}
