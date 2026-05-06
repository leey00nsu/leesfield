import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { MonitoringRequestItem } from "@/features/monitoring-dashboard/model/types";
import { formatDuration } from "@/features/monitoring-dashboard/lib/format";
import { cn } from "@/shared/lib/utils";
import { resolveMonitoringStatus } from "@/features/monitoring-dashboard/lib/monitoring-request-status";
import { MonitoringRequestDetailDialog } from "@/features/monitoring-dashboard/ui/monitoring-request-detail-dialog";
import { AppButton } from "@/shared/ui/app-button";
import { AppCard } from "@/shared/ui/app-card";
import {
  AppSelectContent,
  AppSelectItem,
  AppSelectRoot,
  AppSelectTrigger,
  AppSelectValue,
} from "@/shared/ui/app-select";

interface MonitoringRequestTableProps {
  items: MonitoringRequestItem[];
  total: number;
  limit: number;
  offset: number;
  onLimitChange: (limit: number) => void;
  onOffsetChange: (offset: number) => void;
  isLoading: boolean;
  error: string | null;
  updatedAt: string | null;
  timeZone: string;
}

export function MonitoringRequestTable({
  items,
  total,
  limit,
  offset,
  onLimitChange,
  onOffsetChange,
  isLoading,
  error,
  updatedAt,
  timeZone,
}: MonitoringRequestTableProps) {
  const t = useTranslations("monitoringDashboard");
  const locale = useLocale();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<MonitoringRequestItem | null>(null);
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const formatDateTime = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    });
    return (value: string) => {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return "-";
      return formatter.format(parsed);
    };
  }, [locale, timeZone]);
  const statusLabels = useMemo<Record<string, string>>(
    () => ({
      pending: t("statuses.pending"),
      processing: t("statuses.processing"),
      completed: t("statuses.completed"),
      failed: t("statuses.failed"),
    }),
    [t],
  );
  const pageSizeOptions = useMemo(
    () =>
      Array.from(new Set([20, 50, 100, limit]))
        .filter((value) => value > 0)
        .sort((a, b) => a - b),
    [limit],
  );
  const pageIndex = limit > 0 ? Math.floor(offset / limit) : 0;
  const pageCount = limit > 0 ? Math.ceil(total / limit) : 0;
  const canPreviousPage = offset > 0;
  const canNextPage = offset + items.length < total;
  const rangeStart = total === 0 ? 0 : Math.min(offset + 1, total);
  const fallbackVisibleCount = total === 0 ? 0 : Math.min(limit, total - offset);
  const visibleCount = items.length > 0 ? items.length : fallbackVisibleCount;
  const rangeEnd = total === 0 ? 0 : Math.min(offset + visibleCount, total);
  const safeCurrentPage = total === 0 ? 0 : pageIndex + 1;
  const safePageCount = total === 0 ? 0 : Math.max(1, pageCount);

  const handleOpenDetail = (item: MonitoringRequestItem) => {
    setSelected(item);
    setDialogOpen(true);
  };

  const handleCloseDetail = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setSelected(null);
  };

  const handleLimitChange = (value: string) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    onLimitChange(parsed);
  };

  const columns = useMemo<ColumnDef<MonitoringRequestItem>[]>(
    () => [
      {
        id: "job",
        header: t("requests.columns.job"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="font-semibold text-white">
              {t(`requests.type.${row.original.type}`)}
            </div>
            <div className="mt-1 truncate text-xs text-white/38">
              {row.original.apiKeyLabel}
            </div>
          </div>
        ),
      },
      {
        id: "model",
        header: t("requests.columns.model"),
        cell: ({ row }) => (
          <div className="flex items-center gap-2 font-semibold text-white">
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-mono uppercase text-gray-400">
              {row.original.type}
            </span>
            <span>{row.original.model ?? "-"}</span>
          </div>
        ),
      },
      {
        id: "timestamp",
        header: t("requests.columns.started"),
        cell: ({ row }) => (
          <span className="text-gray-500">
            {formatDateTime(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: "duration",
        header: t("requests.columns.duration"),
        cell: ({ row }) => (
          <span className="text-primary">
            {formatDuration(row.original.durationMs)}
          </span>
        ),
      },
      {
        id: "status",
        header: () => (
          <div className="text-right">{t("requests.columns.status")}</div>
        ),
        cell: ({ row }) => {
          const status = resolveMonitoringStatus(row.original.status, statusLabels);
          const Icon = status.icon;
          return (
            <div className="text-right">
              <span
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs font-semibold",
                  status.className,
                )}
              >
                <Icon className="h-4 w-4" />
                {status.label}
              </span>
            </div>
          );
        },
      },
      {
        id: "open",
        header: "",
        cell: () => (
          <div className="flex justify-end text-white/35 transition-colors group-hover:text-primary">
            <ChevronRight className="h-5 w-5" />
          </div>
        ),
      },
    ],
    [formatDateTime, statusLabels, t],
  );

  const table = useReactTable({
    data: items,
    columns,
    manualPagination: true,
    pageCount,
    getCoreRowModel: getCoreRowModel(),
    state: {
      pagination: {
        pageIndex,
        pageSize: limit,
      },
    },
  });

  return (
    <AppCard variant="editorial-flat" radius="lg" padding="lg">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xl font-semibold text-white">
            {t("requests.title")}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-white/38">
            <span>{t("requests.subtitle")}</span>
            <span>
              {t("requests.pagination.range", {
                start: numberFormatter.format(rangeStart),
                end: numberFormatter.format(rangeEnd),
                total: numberFormatter.format(total),
              })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-primary">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          {updatedAt ? t("requests.updated", { time: formatDateTime(updatedAt) }) : t("requests.updating")}
        </div>
      </div>

      <div className="mt-5 w-full overflow-x-auto">
        {error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : isLoading ? (
          <div
            data-testid="monitoring-request-table-skeleton"
            className="grid gap-2 rounded-xl border border-white/10 bg-background-dark/50 p-3"
          >
            {Array.from({ length: 5 }, (_, index) => (
              <div
                key={index}
                className="grid min-w-[720px] grid-cols-[1.35fr_1fr_1fr_0.75fr_0.85fr_2rem] items-center gap-4 rounded-lg border border-white/[0.045] px-3 py-3"
              >
                <span className="h-4 rounded-full bg-white/10" />
                <span className="h-4 rounded-full bg-white/8" />
                <span className="h-4 rounded-full bg-white/8" />
                <span className="h-4 rounded-full bg-white/8" />
                <span className="h-6 rounded-full bg-white/10" />
                <span className="h-4 rounded-full bg-white/8" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-xl border border-white/10 bg-background-dark/50 text-sm text-gray-400">
            {t("requests.empty")}
          </div>
        ) : (
          <>
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr
                    key={headerGroup.id}
                    className="border-b border-white/10 text-xs font-mono uppercase tracking-widest text-gray-500"
                  >
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className={cn(
                          "px-4 py-3",
                          header.id === "status" && "text-right",
                          header.id === "open" && "w-12 text-right",
                        )}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-white/5">
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="group cursor-pointer transition-colors hover:bg-white/[0.045] focus-within:bg-white/[0.045]"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleOpenDetail(row.original)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleOpenDetail(row.original);
                      }
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className="font-mono uppercase tracking-widest">
                  {t("requests.pagination.rowsPerPage")}
                </span>
                <AppSelectRoot value={String(limit)} onValueChange={handleLimitChange}>
                  <AppSelectTrigger
                    triggerSize="sm"
                    className="w-[92px] text-xs"
                  >
                    <AppSelectValue />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    {pageSizeOptions.map((option) => (
                      <AppSelectItem key={option} value={String(option)}>
                        {option}
                      </AppSelectItem>
                    ))}
                  </AppSelectContent>
                </AppSelectRoot>
              </div>
              <div className="flex items-center gap-2">
                <AppButton
                  type="button"
                  size="sm"
                  variant="surface"
                  onClick={() => onOffsetChange(Math.max(0, offset - limit))}
                  disabled={!canPreviousPage}
                  aria-label={t("requests.pagination.previous")}
                >
                  <ChevronLeft className="h-4 w-4" />
                </AppButton>
                <div className="min-w-[84px] text-center text-xs font-mono text-gray-400">
                  {t("requests.pagination.page", {
                    current: safeCurrentPage,
                    total: safePageCount,
                  })}
                </div>
                <AppButton
                  type="button"
                  size="sm"
                  variant="surface"
                  onClick={() => onOffsetChange(offset + limit)}
                  disabled={!canNextPage}
                  aria-label={t("requests.pagination.next")}
                >
                  <ChevronRight className="h-4 w-4" />
                </AppButton>
              </div>
            </div>
          </>
        )}
      </div>
      <MonitoringRequestDetailDialog
        open={dialogOpen}
        onOpenChange={handleCloseDetail}
        request={selected}
        timeZone={timeZone}
      />
    </AppCard>
  );
}
