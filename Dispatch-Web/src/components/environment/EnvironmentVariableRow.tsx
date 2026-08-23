

export interface EnvironmentVariableDraft {
  id: string;
  key: string;
  value: string;
}

interface EnvironmentVariableRowProps {
  variable: EnvironmentVariableDraft;
  isDuplicate: boolean;
  onChange: (field: "key" | "value", value: string) => void;
  onDelete: () => void;
}

export const EnvironmentVariableRow: React.FC<
  EnvironmentVariableRowProps
> = ({ variable, isDuplicate, onChange, onDelete }) => (
  <tr className="group transition-colors hover:bg-[#202020]">
    <td className="w-1/2 align-top" style={{ padding: "4px 24px" }}>
      <input
        value={variable.key}
        onChange={(event) => onChange("key", event.target.value)}
        placeholder="Variable"
        className={`w-full bg-transparent px-1 py-1 font-mono text-xs outline-none ${
          isDuplicate ? "text-red-400" : "text-zinc-200"
        }`}
        aria-invalid={isDuplicate}
        spellCheck={false}
      />
      {isDuplicate && (
        <p className="px-1 pb-1 text-xs text-red-400">
          Variable names must be unique.
        </p>
      )}
    </td>
    <td
      className="w-1/2 border-l border-[#2e2e2e] align-top"
      style={{ padding: "4px 24px" }}
    >
      <div className="flex items-center">
        <input
          value={variable.value}
          onChange={(event) => onChange("value", event.target.value)}
          placeholder="Value"
          className="min-w-0 flex-1 bg-transparent px-1 py-1 font-mono text-xs text-zinc-200 outline-none"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={onDelete}
          className="ml-2 -mr-1 shrink-0 p-1 text-sm font-bold text-zinc-500 hover:text-red-400"
          title="Delete variable"
          aria-label="Delete variable"
        >
          ×
        </button>
      </div>
    </td>
  </tr>
);
