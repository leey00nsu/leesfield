"use client";

import type { ReactNode } from "react";
import { CheckCircle2, Info, XCircle } from "lucide-react";
import { Toaster, toast, type ExternalToast } from "sonner";

type AppToastOptions = Omit<ExternalToast, "description"> & {
  description?: ReactNode;
};

const toastClassNames = {
  toast:
    "border border-border bg-popover text-popover-foreground rounded-lg shadow-md",
  title: "text-sm font-semibold text-white",
  description: "text-xs leading-5 text-muted-foreground",
  closeButton:
    "border-border bg-popover text-muted-foreground hover:bg-muted hover:text-foreground",
  icon: "text-primary",
};

export function AppToaster() {
  return (
    <Toaster
      closeButton
      position="top-right"
      theme="dark"
      toastOptions={{
        classNames: toastClassNames,
        duration: 2200,
      }}
      icons={{
        success: <CheckCircle2 className="h-4 w-4 text-primary" />,
        info: <Info className="h-4 w-4 text-primary" />,
        error: <XCircle className="h-4 w-4 text-destructive" />,
      }}
    />
  );
}

export const appToast = {
  success(title: ReactNode, options?: AppToastOptions) {
    return toast.success(title, options);
  },
  error(title: ReactNode, options?: AppToastOptions) {
    return toast.error(title, options);
  },
  copied(title: ReactNode, options?: AppToastOptions) {
    return toast.success(title, options);
  },
};
