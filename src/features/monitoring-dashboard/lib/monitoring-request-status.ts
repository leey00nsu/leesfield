import { CheckCircle2, Clock3, ShieldAlert, Timer } from "lucide-react";

export type MonitoringStatusStyle = {
  label: string;
  className: string;
  icon: typeof Clock3;
};

const statusStyles: Record<string, MonitoringStatusStyle> = {
  pending: {
    label: "Pending",
    className: "text-yellow-400",
    icon: Clock3,
  },
  processing: {
    label: "Processing",
    className: "text-primary",
    icon: Timer,
  },
  completed: {
    label: "Completed",
    className: "text-green-400",
    icon: CheckCircle2,
  },
  failed: {
    label: "Failed",
    className: "text-destructive",
    icon: ShieldAlert,
  },
};

export function resolveMonitoringStatus(
  status: string,
  labels: Record<string, string>,
): MonitoringStatusStyle {
  const lower = status.toLowerCase();
  const style = statusStyles[lower];
  if (!style) {
    return {
      label: status,
      className: "text-gray-400",
      icon: Clock3,
    };
  }

  const label = labels[lower] ?? style.label;
  return {
    ...style,
    label,
  };
}
