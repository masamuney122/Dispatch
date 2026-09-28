import { useState } from "react";
import type { RequestScripts } from "../../types/script";
import { ScriptEditor } from "./ScriptEditor";

interface ScriptsEditorProps {
  value: RequestScripts;
  onChange: (value: RequestScripts) => void;
}

type ScriptEditorSection = "pre_request" | "post_response";

const examples: Record<ScriptEditorSection, string> = {
  pre_request: `// dp and pm point to the same scripting API.\n// pm.request.headers.upsert({ key: "X-Trace-Id", value: "123" });\n// pm.request.url.query.upsert({ key: "source", value: "dispatch" });`,
  post_response: `// Runs after the response is received.\n// pm.test("status is 200", () => {\n//   pm.expect(pm.response.code).to.equal(200);\n// });`,
};

export const ScriptsEditor: React.FC<ScriptsEditorProps> = ({ value, onChange }) => {
  const [section, setSection] = useState<ScriptEditorSection>("pre_request");
  const source = value[section];

  return (
    <div className="relative flex h-[300px] min-h-0 flex-col overflow-visible bg-transparent">
      <div className="flex shrink-0 items-center justify-between">
        <div className="-mb-px flex items-center gap-4">
          {([
            ["pre_request", "Pre-request"],
            ["post_response", "Post-response"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSection(key)}
              className={`border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
                section === key
                  ? "border-[#ff6c37] text-zinc-100"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="pr-1 text-[10px] text-zinc-600">JavaScript · 1 s limit · dp.* / pm.* compatible subset</span>
      </div>
      <div className="relative ml-[-24px] min-h-0 w-[calc(100%+24px)] flex-1 bg-transparent">
        <ScriptEditor
          key={section}
          ariaLabel={`${section === "pre_request" ? "Pre-request" : "Post-response"} script editor`}
          value={source}
          onChange={(nextSource) => onChange({ ...value, [section]: nextSource })}
        />
        {!source && (
          <div className="pointer-events-none absolute left-10 top-1 whitespace-pre-wrap font-mono text-[13px] leading-[22px] text-zinc-700">
            {examples[section]}
          </div>
        )}
      </div>
    </div>
  );
};
