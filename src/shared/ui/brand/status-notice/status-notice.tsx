import { CircleCheck, Info, TriangleAlert } from "lucide-react";
import type * as React from "react";

import { cn } from "@/shared/lib/utils";

type StatusNoticeTone = "destructive" | "neutral" | "success" | "warning";

type StatusNoticeProps = Omit<React.ComponentProps<"div">, "title"> & {
  action?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  title?: React.ReactNode;
  tone?: StatusNoticeTone;
};

const toneClasses: Record<StatusNoticeTone, { icon: string; root: string }> = {
  neutral: {
    icon: "bg-foreground/7 text-muted-foreground",
    root: "bg-muted/45 text-foreground",
  },
  success: {
    icon: "bg-success/55 text-success-foreground",
    root: "bg-success/28 text-foreground",
  },
  warning: {
    icon: "bg-warning/75 text-warning-foreground",
    root: "bg-warning/35 text-foreground",
  },
  destructive: {
    icon: "bg-destructive/10 text-destructive",
    root: "bg-destructive/[0.055] text-destructive",
  },
};

function defaultIcon(tone: StatusNoticeTone) {
  if (tone === "success") return <CircleCheck />;
  if (tone === "warning" || tone === "destructive") return <TriangleAlert />;
  return <Info />;
}

function StatusNotice({
  action,
  children,
  className,
  description,
  icon,
  role,
  title,
  tone = "neutral",
  ...props
}: StatusNoticeProps) {
  const classes = toneClasses[tone];

  return (
    <div
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-xl px-4 py-3.5 text-sm leading-6",
        classes.root,
        action && "sm:grid-cols-[auto_minmax(0,1fr)_auto]",
        className,
      )}
      data-slot="status-notice"
      data-tone={tone}
      role={role ?? (tone === "destructive" ? "alert" : "status")}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn("flex size-7 shrink-0 items-center justify-center rounded-full [&_svg]:size-4", classes.icon)}
        data-slot="status-notice-icon"
      >
        {icon ?? defaultIcon(tone)}
      </span>
      <div className="min-w-0 self-center" data-slot="status-notice-content">
        {title ? <p className="font-semibold text-current">{title}</p> : null}
        {description ? (
          <div className={cn("text-xs leading-5", title ? "mt-0.5 text-muted-foreground" : "text-current/80")}>
            {description}
          </div>
        ) : null}
        {children}
      </div>
      {action ? <div className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-3">{action}</div> : null}
    </div>
  );
}

export type { StatusNoticeProps, StatusNoticeTone };
export { StatusNotice };
