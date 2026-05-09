import CodeMirror from "@uiw/react-codemirror";
import { json as jsonLanguage } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { StreamLanguage } from "@codemirror/language";
import { r as rMode } from "@codemirror/legacy-modes/mode/r";
import { shell as shellMode } from "@codemirror/legacy-modes/mode/shell";

type EditorLanguage = "python" | "r" | "bash" | "json";

function getExtensions(language: EditorLanguage) {
  switch (language) {
    case "python":
      return [python()];
    case "r":
      return [StreamLanguage.define(rMode)];
    case "bash":
      return [StreamLanguage.define(shellMode)];
    case "json":
      return [jsonLanguage()];
    default:
      return [];
  }
}

export function CodeEditor({
  value,
  onChange,
  language,
  minHeight = "320px",
}: {
  value: string;
  onChange: (value: string) => void;
  language: EditorLanguage;
  minHeight?: string;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <CodeMirror
        value={value}
        height={minHeight}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          autocompletion: true,
        }}
        extensions={getExtensions(language)}
        onChange={onChange}
        theme="light"
        className="text-sm"
      />
    </div>
  );
}