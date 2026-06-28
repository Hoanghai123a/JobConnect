import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import { escapePb } from "@/lib/delegations";
import { pb } from "@/lib/pocketbase";
import type { StaffActionLogRecord } from "@/lib/staff-log";

export const Route = createFileRoute("/_authenticated/admin/accounts/logs")({
  beforeLoad: () => {
    const currentUser = pb.authStore.record as any;
    if (!currentUser || currentUser.role !== "admin")
      throw redirect({ to: "/account", search: {} as any });
  },
  component: AccountLogsPage,
});

const ACTION_LABELS: Record<string, string> = {
  create: "T\u1ea1o m\u1edbi",
  update: "C\u1eadp nh\u1eadt",
  delete: "X\u00f3a",
  import: "Import",
  report_advance: "B\u00e1o \u1ee9ng",
  report_leave: "B\u00e1o ngh\u1ec9",
  report_join: "B\u00e1o \u0111i l\u00e0m m\u1edbi",
  update_bank: "C\u1eadp nh\u1eadt ng\u00e2n h\u00e0ng",
};

function joinPbFilters(parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" && ");
}

function buildLogFilter(actionFilter: string, search: string) {
  const q = escapePb(search.trim());
  const searchFilter = q
    ? `(${[
        "actor.full_name",
        "actor.username",
        "target_user.full_name",
        "target_user.username",
        "target_collection",
        "note",
        "action",
      ]
        .map((field) => `${field}~"${q}"`)
        .join(" || ")})`
    : "";

  return joinPbFilters([
    actionFilter === "all" ? "" : `action="${escapePb(actionFilter)}"`,
    searchFilter,
  ]);
}

function AccountLogsPage() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<StaffActionLogRecord[]>([]);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const filter = buildLogFilter(actionFilter, search);

    pb.collection("staff_action_logs")
      .getList<StaffActionLogRecord>(page, 50, {
        filter,
        sort: "-created",
        expand: "actor,target_user",
      })
      .then((res) => {
        if (!alive) return;
        setLogs((current) => (page === 1 ? res.items : [...current, ...res.items]));
        setTotalPages(res.totalPages || 1);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [actionFilter, page, search]);

  const updateActionFilter = (value: string) => {
    setActionFilter(value);
    setPage(1);
    setLogs([]);
  };

  const updateSearch = (value: string) => {
    setSearch(value);
    setPage(1);
    setLogs([]);
  };

  return (
    <PageContainer
      title="Nh\u1eadt k\u00fd thay \u0111\u1ed5i"
      subtitle="Theo d\u00f5i m\u1ecdi thao t\u00e1c staff v\u00e0 admin trong h\u1ec7 th\u1ed1ng"
      right={
        <Link
          to="/admin/accounts"
          className="flex h-9 items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 text-xs font-medium text-foreground shadow-soft"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {"T\u00e0i kho\u1ea3n"}
        </Link>
      }
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => updateSearch(event.target.value)}
          placeholder="T\u00ecm theo actor, user \u0111\u00edch, collection, ghi ch\u00fa..."
          className="rounded-full pl-9"
        />
      </div>

      <Select value={actionFilter} onValueChange={updateActionFilter}>
        <SelectTrigger className="rounded-xl">
          <SelectValue placeholder="L\u1ecdc theo thao t\u00e1c" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{"T\u1ea5t c\u1ea3 thao t\u00e1c"}</SelectItem>
          {Object.keys(ACTION_LABELS).map((action) => (
            <SelectItem key={action} value={action}>
              {ACTION_LABELS[action]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {loading ? (
        <div className="rounded-2xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">
          {"\u0110ang t\u1ea3i nh\u1eadt k\u00fd..."}
        </div>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Ch\u01b0a c\u00f3 log ph\u00f9 h\u1ee3p"
          description="Th\u1eed \u0111\u1ed5i b\u1ed9 l\u1ecdc ho\u1eb7c thao t\u00e1c th\u00eam tr\u00ean m\u00e0n h\u00ecnh staff/admin \u0111\u1ec3 h\u1ec7 th\u1ed1ng ghi log m\u1edbi."
        />
      ) : (
        <>
          {logs.map((item) => {
            const actorName =
              item.expand?.actor?.full_name || item.expand?.actor?.username || item.actor;
            const actorUsername = item.expand?.actor?.username;
            const targetName =
              item.expand?.target_user?.full_name ||
              item.expand?.target_user?.username ||
              item.target_user ||
              "";
            const roleLabel = item.actor_role_snapshot || "user";
            return (
              <div
                key={item.id}
                className="rounded-xl border border-border/60 bg-card px-3 py-2.5 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold">
                        {ACTION_LABELS[item.action] || item.action}
                      </span>
                      <StatusChip tone="info">{item.target_collection}</StatusChip>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {actorName}
                      {actorUsername ? ` @${actorUsername}` : ""}
                      {" - "}
                      {roleLabel}
                      {targetName ? ` -> ${targetName}` : ""}
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatDateTime(item.created)}
                  </span>
                </div>
                {item.note && (
                  <div className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                    {item.note}
                  </div>
                )}
              </div>
            );
          })}
          {page < totalPages && (
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-full"
              disabled={loading}
              onClick={() => setPage((current) => current + 1)}
            >
              {loading ? "\u0110ang t\u1ea3i..." : "T\u1ea3i th\u00eam nh\u1eadt k\u00fd"}
            </Button>
          )}
        </>
      )}
    </PageContainer>
  );
}

function formatDateTime(value?: string) {
  if (!value) return "Kh\u00f4ng r\u00f5 th\u1eddi gian";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("vi-VN");
}
