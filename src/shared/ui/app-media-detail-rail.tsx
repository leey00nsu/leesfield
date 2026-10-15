"use client";

import type { FormEventHandler, ReactNode } from "react";
import { Save } from "lucide-react";
import { AppDetailRail } from "./app-detail-rail";
import { AppCloseButton } from "./app-close-button";
import { AppButton } from "./app-button";
import { AppTabs, type AppTabItem } from "./app-tabs";

export function AppMediaDetailRail({
  tabs, formId, onSubmit, onClose, closeLabel, tabsLabel, saveLabel,
  saving = false, saveDisabled = false, busy = false, actions, message, testId, headerActions, notice,
}: {
  tabs: AppTabItem[];
  formId: string;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  onClose: () => void;
  closeLabel: string;
  tabsLabel: string;
  saveLabel: string;
  saving?: boolean;
  saveDisabled?: boolean;
  busy?: boolean;
  actions?: ReactNode;
  message?: ReactNode;
  testId?: string;
  headerActions?: ReactNode;
  notice?: ReactNode;
}) {
  return (
    <AppDetailRail className="min-h-0 gap-0" bodyClassName="flex overflow-hidden" data-testid={testId}
      header={<div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2">{headerActions}</div><AppCloseButton aria-label={closeLabel} disabled={busy} onClick={onClose} /></div>}
      footer={<div className="grid gap-2">
        {message}
        <AppButton type="submit" form={formId} size="lg" variant="generate"
          disabled={saveDisabled || busy || saving} className="h-12 w-full rounded-xl text-sm shadow-none">
          <Save className="size-4" />{saveLabel}
        </AppButton>
        <div className="grid grid-cols-4 gap-2 lg:grid-cols-2">{actions}</div>
      </div>}>
      <form id={formId} onSubmit={onSubmit} className="flex min-h-0 w-full flex-col gap-3">
        {notice}
        <AppTabs ariaLabel={tabsLabel} items={tabs} className="flex min-h-0 flex-1 flex-col" panelClassName="min-h-0 overflow-y-auto overscroll-contain" listClassName="w-full min-h-11 shrink-0 items-center justify-start overflow-x-auto overflow-y-hidden" triggerClassName="h-8 min-h-8 flex-none px-2 text-xs" />
      </form>
    </AppDetailRail>
  );
}
