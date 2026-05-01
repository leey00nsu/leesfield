"use client";

import type { ReactNode } from "react";
import { CheckCircle2, Info, XCircle } from "lucide-react";
import { Toaster, toast, type ExternalToast } from "sonner";

type AppToastOptions = Omit<ExternalToast, "description"> & {
  description?: ReactNode;
};

const toastClassNames = {
  toast:
    "border border-white/10 bg-[#111414]/95 text-white shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-xl",
  title: "text-sm font-semibold text-white",
  description: "text-xs leading-5 text-white/52",
  closeButton:
    "border-white/10 bg-black/40 text-white/60 hover:bg-white/10 hover:text-white",
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
        error: <XCircle className="h-4 w-4 text-red-300" />,
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
