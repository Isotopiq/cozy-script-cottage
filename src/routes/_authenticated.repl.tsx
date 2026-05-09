import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Power } from "lucide-react";

export const Route = createFileRoute("/_authenticated/repl")({
  head: () => ({ meta: [{ title: "REPL — Script Hub" }] }),
  component: ReplPage,
});

function ReplPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [language, setLanguage] = useState<"python" | "r">("python");
  const [active, setActive] = useState(false);
  const bufferRef = useRef("");

  const prompt = language === "python" ? ">>> " : "> ";

  const start = () => {
    if (!containerRef.current) return;
    if (termRef.current) termRef.current.dispose();
    const term = new Terminal({
      theme: {
        background: "oklch(0.10 0.018 260)" as unknown as string,
        foreground: "#e5e7eb",
        cursor: "#a3e635",
      },
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
    setActive(true);

    term.writeln(`\x1b[38;2;163;230;53m${language === "python" ? "Python 3.11.6 (mock REPL)" : "R 4.3.2 (mock REPL)"}\x1b[0m`);
    term.writeln("\x1b[2;37mConnect a worker to run real code. Echo mode for now.\x1b[0m");
    term.write(prompt);

    bufferRef.current = "";
    term.onData((data) => {
      const code = data.charCodeAt(0);
      if (code === 13) {
        term.write("\r\n");
        const line = bufferRef.current;
        bufferRef.current = "";
        if (line.trim()) {
          // mock evaluation
          if (line.startsWith("?") || line === "help") {
            term.writeln("\x1b[2;37mmock REPL — connect a worker for real execution.\x1b[0m");
          } else if (/^\s*\d+\s*[\+\-\*\/]\s*\d+\s*$/.test(line)) {
            try { term.writeln(String(eval(line))); } catch { term.writeln("error"); }
          } else if (/^print\((.*)\)$/.test(line.trim())) {
            const m = line.trim().match(/^print\((.*)\)$/);
            term.writeln(m ? m[1].replace(/^["']|["']$/g, "") : "");
          } else {
            term.writeln(`\x1b[2;37m[mock] ${line}\x1b[0m`);
          }
        }
        term.write(prompt);
      } else if (code === 127) {
        if (bufferRef.current.length > 0) {
          bufferRef.current = bufferRef.current.slice(0, -1);
          term.write("\b \b");
        }
      } else if (code >= 32) {
        bufferRef.current += data;
        term.write(data);
      }
    });

    const onResize = () => fit.fit();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  };

  const stop = () => {
    termRef.current?.dispose();
    termRef.current = null;
    setActive(false);
  };

  useEffect(() => () => { termRef.current?.dispose(); }, []);

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-mono text-3xl tracking-tight">REPL</h1>
          <p className="text-sm text-muted-foreground">Interactive Python / R prompt — proxied through your worker.</p>
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
            <Button variant="destructive" onClick={stop}><Power className="mr-1 h-4 w-4" /> Stop session</Button>
          ) : (
            <Button onClick={start}><Power className="mr-1 h-4 w-4" /> Start session</Button>
          )}
        </div>
      </div>
      <Card className="overflow-hidden p-0">
        <div className="flex items-center gap-1.5 border-b border-border bg-secondary/40 px-3 py-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
          <span className="ml-2 font-mono text-[11px] text-muted-foreground">
            {active ? `${language} — interactive` : "session not started"}
          </span>
        </div>
        <div ref={containerRef} className="h-[560px] bg-[oklch(0.10_0.018_260)] p-2" />
      </Card>
      <p className="font-mono text-[11px] text-muted-foreground">
        Tip: this terminal currently runs in mock mode. When you point Script Hub at a worker, this view connects to its WS endpoint with a short-lived signed token.
      </p>
    </div>
  );
}
