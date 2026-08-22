import type { ReactElement } from "react";
import type { SLAState, Priority, TicketStatus } from "../graphql/types";

export function SLABadge({ state }: { state: SLAState }): ReactElement {
  const map: Record<SLAState, { cls: string; label: string; icon: string }> = {
    ON_TRACK: { cls: "on-track", label: "On Track", icon: "✓" },
    AT_RISK:  { cls: "at-risk",  label: "At Risk",  icon: "⚠" },
    BREACHED: { cls: "breached", label: "Breached",  icon: "✕" }
  };
  const { cls, label, icon } = map[state];
  return <span className={`badge ${cls}`}>{icon} {label}</span>;
}

export function PriorityBadge({ priority }: { priority: Priority }): ReactElement {
  const cls = `badge priority-${priority.toLowerCase()}`;
  return <span className={cls}>{priority}</span>;
}

export function StatusBadge({ status }: { status: TicketStatus }): ReactElement {
  const labels: Record<TicketStatus, string> = {
    OPEN: "Open",
    IN_PROGRESS: "In Progress",
    RESOLVED: "Resolved",
    CLOSED: "Closed"
  };
  const cls = `badge status-${status.toLowerCase()}`;
  return <span className={cls}>{labels[status]}</span>;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
