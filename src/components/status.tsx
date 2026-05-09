import type { RunStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const map: Record<RunStatus, string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-accent/15 text-accent border border-accent/30 animate-pulse",
  succeeded: "bg-success/15 text-success border border-success/30",
  failed: "bg-destructive/15 text-destructive border border-destructive/30",
  canceled: "bg-muted text-muted-foreground border border-border",
};

export function StatusPill({ status, className }: { status: RunStatus; className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-mono uppercase tracking-wider",
      map[status], className,
    )}>
      <span className={cn(
        "h-1.5 w-1.5 rounded-full",
        status === "running" ? "bg-accent" :
        status === "succeeded" ? "bg-success" :
        status === "failed" ? "bg-destructive" : "bg-muted-foreground",
      )} />
      {status}
    </span>
  );
}

export function LangBadge({ lang }: { lang: string }) {
  const colors: Record<string, string> = {
    python: "bg-chart-3/20 text-chart-3 border-chart-3/30",
    r: "bg-chart-2/20 text-chart-2 border-chart-2/30",
    bash: "bg-chart-5/20 text-chart-5 border-chart-5/30",
  };
  return (
    <span className={cn(
      "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-mono uppercase",
      colors[lang] ?? "bg-muted text-muted-foreground border-border",
    )}>
      {lang}
    </span>
  );
}
