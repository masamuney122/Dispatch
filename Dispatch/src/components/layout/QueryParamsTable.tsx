
import type { QueryParamItem } from "../../types/tab";
import type { AuthConfig } from "../../types/auth";

interface QueryParamsTableProps {
  params: QueryParamItem[];
  onChange: (params: QueryParamItem[]) => void;
  auth?: AuthConfig;
}

export const QueryParamsTable: React.FC<QueryParamsTableProps> = ({ params, onChange, auth }) => {
  const updateParam = (index: number, field: "key" | "value", val: string) => {
    const updated = [...params];
    updated[index] = { ...updated[index], [field]: val };
    onChange(updated);
  };

  const removeParam = (index: number) => {
    onChange(params.filter((_, i) => i !== index));
  };

  const addParam = () => {
    onChange([...params, { key: "", value: "" }]);
  };

  const apiKeyQueryParam =
    auth?.type === "ApiKey" && auth.add_to === "QueryParam" && auth.key.trim()
      ? { key: auth.key, value: "••••••••" }
      : null;

  return (
    <div className="flex flex-col gap-2 shrink-0 font-sans text-xs">
      <div className="flex items-center justify-between select-none">
        <span className="font-bold text-zinc-300 text-xs tracking-wide">Query Params</span>
      </div>

      <div className="border border-[#3a3a3a] rounded-md bg-[#212121] overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-[#242424] border-b border-[#343434] text-zinc-400 font-semibold select-none text-xs">
              <th className="w-1/3" style={{ padding: '8px 24px' }}>Key</th>
              <th className="border-l border-[#2e2e2e] w-1/3" style={{ padding: '8px 24px' }}>Value</th>
              <th className="border-l border-[#2e2e2e] flex items-center justify-between" style={{ padding: '8px 24px' }}>
                <span>Description</span>
                <div className="flex items-center gap-3 text-zinc-400 font-normal">
                  <button onClick={addParam} className="hover:underline cursor-pointer text-sky-400 font-medium">
                    + Add
                  </button>
                  <span className="hover:underline cursor-pointer">Bulk Edit</span>
                  <span className="cursor-pointer tracking-widest font-bold">...</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#282828]">
            {apiKeyQueryParam && (
              <tr className="select-none bg-[#222222] text-zinc-500">
                <td className="font-mono text-xs" style={{ padding: '8px 24px' }}>
                  {apiKeyQueryParam.key}
                </td>
                <td className="border-l border-[#2e2e2e] font-mono text-xs" style={{ padding: '8px 24px' }}>
                  {apiKeyQueryParam.value}
                </td>
                <td className="border-l border-[#2e2e2e] text-[11px] italic text-zinc-600" style={{ padding: '8px 24px' }}>
                  Automatically generated based on Authorization tab
                </td>
              </tr>
            )}
            {params.length === 0 && !apiKeyQueryParam ? (
              <tr onClick={addParam} className="h-8 hover:bg-[#242424] transition-colors cursor-text">
                <td className="text-zinc-600 font-mono" style={{ padding: '0 24px' }}>Key</td>
                <td className="border-l border-[#2e2e2e] text-zinc-600 font-mono" style={{ padding: '0 24px' }}>Value</td>
                <td className="border-l border-[#2e2e2e] text-zinc-600 italic" style={{ padding: '0 24px' }}>Description</td>
              </tr>
            ) : params.length > 0 ? (
              params.map((param, idx) => (
                <tr key={idx} className="h-8 hover:bg-[#202020] transition-colors group">
                  <td style={{ padding: '0 24px' }}>
                    <input
                      type="text"
                      value={param.key}
                      onChange={(e) => updateParam(idx, "key", e.target.value)}
                      placeholder="Key"
                      className="h-8 w-full bg-transparent px-1 text-zinc-200 font-mono text-xs focus:outline-none"
                    />
                  </td>
                  <td className="border-l border-[#2e2e2e]" style={{ padding: '0 24px' }}>
                    <input
                      type="text"
                      value={param.value}
                      onChange={(e) => updateParam(idx, "value", e.target.value)}
                      placeholder="Value"
                      className="h-8 w-full bg-transparent px-1 text-zinc-200 font-mono text-xs focus:outline-none"
                    />
                  </td>
                  <td className="h-8 border-l border-[#2e2e2e] flex items-center justify-between" style={{ padding: '0 24px' }}>
                    <span className="text-zinc-500 text-xs italic">Description</span>
                    <button
                      onClick={() => removeParam(idx)}
                      className="text-zinc-500 hover:text-red-400 p-1 text-sm font-bold"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
};
