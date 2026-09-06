"use client";
import type { ReactNode } from "react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/shared/ui/brand/tabs/tabs";
export type AppTabItem = {
  value: string;
  label: ReactNode;
  content: ReactNode;
};
export function AppTabs({
  items,
  defaultValue,
  ariaLabel,
  className,
  listClassName,
  panelClassName,
}: {
  items: AppTabItem[];
  defaultValue?: string;
  ariaLabel: string;
  className?: string;
  listClassName?: string;
  panelClassName?: string;
}) {
  return (
    <Tabs
      data-horizontal=""
      defaultValue={defaultValue ?? items[0]?.value}
      className={className}
    >
      <TabsList aria-label={ariaLabel} className={listClassName}>
        {items.map((item) => (
          <TabsTrigger key={item.value} value={item.value}>
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {items.map((item) => (
        <TabsContent
          key={item.value}
          value={item.value}
          className={panelClassName}
        >
          {item.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
