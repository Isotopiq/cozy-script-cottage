import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Power } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/repl")({
  head: () => ({ meta: [{ title: "REPL — Script Hub" }] }),
  component: ReplPage,
});

type IoRow = { id: number; kind: "in" | "out" | "err" | "sys"; content: string };
type SessionRow = { id: string; status: string; stop_requested: boolean };

function ReplPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const bufferRef = useRef("");
  const sessionIdRef = useRef<string | null>(null);
  const lastIoIdRef = useRef(0);
  const statusRef = useRef<"idle" | "starting" | "running" | "stopped">("idle");
  const channelsRef = useRef<Array<ReturnType<typeof supabase.channel>>>([]);

  const [language, setLanguage] = useState<"python" | "r">("python");
  const [status, setStatus] = useState<"idle" | "starting" | "running" | "stopped">("idle");
  const [busy, setBusy] = useState(false);

  const prompt = language === "python" ? ">>> " : "> ";

  const writeStream = (term: Terminal, row: IoRow) => {
    if (row.kind === "out")      term.writeln(row.content);
    else if (row.kind === "err") term.writeln(`\x1b[38;2;248;113;113m${row.content}\x1b[0m`);
    else if (row.kind === "sys") term.writeln(`\x1b[2;37m${row.content}\x1b[0m`);
    // 'in' is echoed locally at type-time, not from the stream
  };

  const handleNewIo = (row: IoRow) => {
    if (row.id <= lastIoIdRef.current) return;
    lastIoIdRef.current = row.id;
    if (!termRef.current) return;
    if (row.kind === "in") return;
    writeStream(termRef.current, row);
  };

  const cleanupChannels = async () => {
    for (const ch of channelsRef.current) {
      try { await supabase.removeChannel(ch); } catch { /* ignore */ }
    }
    channelsRef.current = [];
  };

  const stop = async (silent = false) => {
    const sid = sessionIdRef.current;
    if (sid) {
      await supabase.from("repl_sessions").update({ stop_requested: true }).eq("id", sid);
    }
    await cleanupChannels();
    termRef.current?.dispose();
    termRef.current = null;
    sessionIdRef.current = null;
    statusRef.current = "stopped";
    setStatus("idle");
    setBusy(false);
    if (!silent) toast.success("REPL session stopped");
  };

  const start = async () => {
    if (!containerRef.current || busy) return;
    setBusy(true);

    // 0. Auth check
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { toast.error("Not signed in"); setBusy(false); return; }

    // 1. Pre-check: at least one online worker
    const { count: onlineCount } = await supabase
      .from("workers").select("id", { count: "exact", head: true }).eq("status", "online");
    if (!onlineCount) {
      toast.error("No worker is currently online. Start a worker, then try again.");
      setBusy(false);
      return;
    }

    // 2. Set up terminal
    if (termRef.current) termRef.current.dispose();
    const term = new Terminal({
      theme: { background: "#1a1a2e", foreground: "#e5e7eb", cursor: "#a3e635" },
      fontFamily: "JetBrains Mono, ui-monospace, monospace",
      fontSize: 13,
      cursorBlink: true,
      convertEol: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;
    statusRef.current = "starting";
    setStatus("starting");

    term.writeln(`\x1b[38;2;163;230;53m${language === "python" ? "Python REPL" : "R REPL"}\x1b[0m`);
    term.writeln("\x1b[2;37mRequesting worker…\x1b[0m");

    // 3. Create session row
    const { data: sessionRow, error: insertErr } = await supabase
      .from("repl_sessions")
      .insert({ user_id: userData.user.id, language })
      .select("id")
      .single();
    if (insertErr || !sessionRow) {
      const msg = insertErr?.message ?? "unknown";
      term.writeln(`\x1b[38;2;248;113;113mFailed to create session: ${msg}\x1b[0m`);
      if (insertErr?.code === "23505" || msg.includes("repl_sessions_one_active_per_user")) {
        toast.error("You already have an active REPL session. Stopping it…");
        await supabase
          .from("repl_sessions")
          .update({ stop_requested: true })
          .eq("user_id", userData.user.id)
          .in("status", ["requested", "running"]);
      } else {
        toast.error(`Could not start REPL: ${msg}`);
      }
      setBusy(false);
      statusRef.current = "idle";
      setStatus("idle");
      return;
    }
    sessionIdRef.current = sessionRow.id;
    lastIoIdRef.current = 0;

    // 4. Subscribe to io stream BEFORE marking running so we don't miss output
    const ioChannel = supabase
      .channel(`repl_io:${sessionRow.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "repl_io", filter: `session_id=eq.${sessionRow.id}` },
        (payload) => handleNewIo(payload.new as IoRow),
      )
      .subscribe();
    channelsRef.current.push(ioChannel);

    // 5. Subscribe to session status updates
    const sessChannel = supabase
      .channel(`repl_sessions:${sessionRow.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "repl_sessions", filter: `id=eq.${sessionRow.id}` },
        (payload) => {
          const row = payload.new as SessionRow;
          if (row.status === "running" && statusRef.current !== "running") {
            statusRef.current = "running";
            setStatus("running");
            setBusy(false);
            term.write(prompt);
            term.focus();
          }
          if (row.status === "stopped" || row.status === "errored") {
            void stop(true);
          }
        },
      )
      .subscribe();
    channelsRef.current.push(sessChannel);

    // 6. Backfill any io that landed before the subscription attached
    const backfill = async () => {
      const { data } = await supabase
        .from("repl_io")
        .select("id, kind, content")
        .eq("session_id", sessionRow.id)
        .order("id", { ascending: true });
      if (data) for (const row of data) handleNewIo(row as IoRow);
    };
    setTimeout(() => { void backfill(); }, 300);

    // 7. Poll status as a safety net (in case realtime is laggy)
    const statusPoll = setInterval(async () => {
      if (!sessionIdRef.current || statusRef.current === "running") {
        clearInterval(statusPoll);
        return;
      }
      const { data } = await supabase
        .from("repl_sessions")
        .select("status")
        .eq("id", sessionRow.id)
        .maybeSingle();
      if (data?.status === "running" && (statusRef.current as string) !== "running") {
        statusRef.current = "running";
        setStatus("running");
        setBusy(false);
        term.write(prompt);
        term.focus();
        clearInterval(statusPoll);
      } else if (data && (data.status === "stopped" || data.status === "errored")) {
        clearInterval(statusPoll);
        void stop(true);
      }
    }, 1000);

    // 8. Input handler — buffer line, on Enter insert into repl_io
    bufferRef.current = "";
    term.onData(async (data) => {
      if (statusRef.current !== "running") return;
      const code = data.charCodeAt(0);
      if (code === 13) {
        term.write("\r\n");
        const line = bufferRef.current;
        bufferRef.current = "";
        const sid = sessionIdRef.current;
        if (sid) {
          const payload = line.length > 8000 ? line.slice(0, 8000) : line;
          const { error } = await supabase.from("repl_io").insert({
            session_id: sid, kind: "in", content: payload,
          });
          if (error) {
            term.writeln(`\x1b[38;2;248;113;113msend failed: ${error.message}\x1b[0m`);
          }
        }
      } else if (code === 127) {
        if (bufferRef.current.length > 0) {
          bufferRef.current = bufferRef.current.slice(0, -1);
          term.write("\b \b");
        }
      } else if (code === 3) {
        // Ctrl-C: send a blank line with a comment so user knows it isn't a real SIGINT
        term.writeln("^C");
        bufferRef.current = "";
      } else if (code >= 32) {
        bufferRef.current += data;
        term.write(data);
      }
    });

    const onResize = () => fit.fit();
    window.addEventListener("resize", onResize);
    channelsRef.current.push({ unsubscribe: () => window.removeEventListener("resize", onResize) } as unknown as ReturnType<typeof supabase.channel>);
  };

  // On unmount, signal stop so worker reaps the child.
  useEffect(() => {
    return () => {
      const sid = sessionIdRef.current;
      if (sid) {
        void supabase.from("repl_sessions").update({ stop_requested: true }).eq("id", sid);
      }
      termRef.current?.dispose();
      void cleanupChannels();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = status === "starting" || status === "running";
  const statusLabel =
    status === "starting" ? `${language} — connecting…` :
    status === "running"  ? `${language} — interactive` :
                            "session not started";

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-mono text-3xl tracking-tight">REPL</h1>
          <p className="text-sm text-muted-foreground">Interactive Python / R prompt — executed live on your worker.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={language} onValueChange={(v) => setLanguage(v as "python" | "r")} disabled={active}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="python">Python 3.11</SelectItem>
              <SelectItem value="r">R 4.3</SelectItem>
            </SelectContent>
          </Select>
          {active ? (
            <Button variant="destructive" onClick={() => void stop()} disabled={busy && statusRef.current !== "running"}>
              <Power className="mr-1 h-4 w-4" /> Stop session
            </Button>
          ) : (
            <Button onClick={() => void start()} disabled={busy}>
              <Power className="mr-1 h-4 w-4" /> Start session
            </Button>
          )}
        </div>
      </div>
      <Card className="overflow-hidden p-0">
        <div className="flex items-center gap-1.5 border-b border-border bg-secondary/40 px-3 py-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
          <span className="ml-2 font-mono text-[11px] text-muted-foreground">{statusLabel}</span>
        </div>
        <div ref={containerRef} className="h-[560px] bg-[#1a1a2e] p-2" />
      </Card>
      <p className="font-mono text-[11px] text-muted-foreground">
        Sessions run inside a connected worker with a 15-minute idle limit and a 60-minute wallclock cap. Only one active session per account.
      </p>
    </div>
  );
}
