import { useEffect, useRef } from "react";
import type { RunLog } from "@/lib/types";

export function LogStream({ logs }: { logs: RunLog[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs.length]);
  return (
    <div ref={ref} className="h-[600px] overflow-auto bg-[oklch(0.10_0.018_260)] p-4 font-mono text-[12px] leading-relaxed scroll-thin">
      {logs.length === 0 && <span className="text-muted-foreground">waiting for logs…</span>}
      {logs.map((l) => (
        <div key={l.id} className="flex gap-3">
          <span className="shrink-0 text-muted-foreground">{new Date(l.ts).toLocaleTimeString()}</span>
          <span className={
            l.stream === "stderr" ? "text-destructive" :
            l.stream === "system" ? "text-accent" : "text-foreground"
          }>{l.line}</span>
        </div>
      ))}
    </div>
  );
}
