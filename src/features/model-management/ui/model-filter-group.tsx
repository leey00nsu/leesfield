"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ListFilter } from "lucide-react";
import { Button } from "@/shared/ui/brand/button/button";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/shared/ui/brand/sheet/sheet";
export function ModelFilterGroup({ children }: { children: ReactNode }) {
  const [mobile, setMobile] = useState(false);
  const t = useTranslations("model.filters");
  useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia("(max-width: 639px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  if (!mobile)
    return (
      <div role="group" aria-label={t("title")}>
        {children}
      </div>
    );
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" />}>
        <ListFilter />
        {t("title")}
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>{t("description")}</SheetDescription>
        </SheetHeader>
        <div className="px-4 py-5">{children}</div>
        <SheetFooter>
          <SheetClose render={<Button />}>{t("apply")}</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
