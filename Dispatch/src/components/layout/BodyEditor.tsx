import { useRef } from "react";
import type { BinaryBody, BodyField, RequestBodyType } from "../../types/request";

interface BodyEditorProps {
  body: string;
  bodyType: RequestBodyType;
  formFields: BodyField[];
  binary?: BinaryBody;
  method: string;
  onChangeBody: (body: string) => void;
  onChangeBodyType: (bodyType: RequestBodyType) => void;
  onChangeFormFields: (fields: BodyField[]) => void;
  onChangeBinary: (binary?: BinaryBody) => void;
}

const BODY_TYPES: Array<{ value: RequestBodyType; label: string }> = [
  { value: "none", label: "None" },
  { value: "json", label: "JSON" },
  { value: "text", label: "Text" },
  { value: "html", label: "HTML" },
  { value: "xml", label: "XML" },
  { value: "form-data", label: "Form-data" },
  { value: "x-www-form-urlencoded", label: "x-www-form-urlencoded" },
  { value: "binary", label: "Binary" },
];

const BODY_PLACEHOLDERS: Partial<Record<RequestBodyType, string>> = {
  json: '{\n  "key": "value"\n}',
  text: "Enter text payload here...",
  html: "<!doctype html>\n<html>\n  <body>\n    <p>Hello</p>\n  </body>\n</html>",
  xml: "<root>\n  <key>value</key>\n</root>",
};

export const BodyEditor: React.FC<BodyEditorProps> = ({
  body,
  bodyType,
  formFields,
  binary,
  method,
  onChangeBody,
  onChangeBodyType,
  onChangeFormFields,
  onChangeBinary,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isBodyAllowed = !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());

  const formatJson = () => {
    try {
      onChangeBody(JSON.stringify(JSON.parse(body), null, 2));
    } catch {
      // The editor intentionally preserves invalid JSON while it is being written.
    }
  };

  const updateField = (index: number, field: keyof BodyField, value: string) => {
    onChangeFormFields(
      formFields.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    );
  };

  const chooseBinaryFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const dataBase64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      onChangeBinary({
        name: file.name,
        mime_type: file.type,
        data_base64: dataBase64,
      });
    };
    reader.readAsDataURL(file);
  };

  if (!isBodyAllowed) {
    return (
      <div className="py-8 text-center text-zinc-500 font-sans text-xs">
        <span>{method} requests do not send a request body in this client.</span>
      </div>
    );
  }

  const addField = () => onChangeFormFields([...formFields, { key: "", value: "" }]);

  const renderFormFields = () => (
    <div className="border border-[#383838] rounded-lg bg-[#202020] overflow-hidden shadow-sm">
      <table className="w-full text-left border-collapse text-xs table-fixed">
        <thead>
          <tr className="bg-[#222222] border-b border-[#2e2e2e] text-zinc-400 font-semibold select-none text-xs">
            <th className="w-1/3 border-r border-[#2e2e2e]" style={{ padding: "8px 16px" }}>Key</th>
            <th className="w-1/3 border-r border-[#2e2e2e]" style={{ padding: "8px 16px" }}>Value</th>
            <th className="w-1/3" style={{ padding: "8px 16px" }}>
              <div className="flex items-center justify-between">
                <span>Description</span>
                <div className="flex items-center gap-3 text-zinc-400 font-normal">
                  <button onClick={addField} className="hover:underline cursor-pointer text-sky-400 font-medium">
                    + Add
                  </button>
                </div>
              </div>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#282828]">
          {formFields.map((field, index) => (
            <tr key={index} className="hover:bg-[#202020] transition-colors group">
              <td className="border-r border-[#2e2e2e]" style={{ padding: "4px 12px" }}>
                <input
                  type="text"
                  value={field.key}
                  onChange={(event) => updateField(index, "key", event.target.value)}
                  placeholder="Key"
                  className="w-full bg-transparent px-1 py-1 font-mono text-xs text-zinc-200 focus:outline-none focus:bg-[#2a2a2a] rounded"
                />
              </td>
              <td className="border-r border-[#2e2e2e]" style={{ padding: "4px 16px" }}>
                <input
                  type="text"
                  value={field.value}
                  onChange={(event) => updateField(index, "value", event.target.value)}
                  placeholder="Value"
                  className="w-full bg-transparent px-1 py-1 font-mono text-xs text-zinc-200 focus:outline-none focus:bg-[#2a2a2a] rounded"
                />
              </td>
              <td style={{ padding: "4px 16px" }}>
                <div className="flex items-center justify-between">
                  <input
                    type="text"
                    placeholder="Description"
                    className="w-full bg-transparent px-1 py-1 text-[11px] text-zinc-500 italic focus:outline-none focus:bg-[#2a2a2a] rounded mr-2"
                  />
                  <button
                    onClick={() => onChangeFormFields(formFields.filter((_, itemIndex) => itemIndex !== index))}
                    className="text-zinc-600 hover:text-red-400 p-1 text-sm font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove field"
                  >
                    ×
                  </button>
                </div>
              </td>
            </tr>
          ))}

          <tr className="hover:bg-[#202020] transition-colors group cursor-text" onClick={addField}>
            <td className="border-r border-[#2e2e2e]" style={{ padding: "4px 12px" }}>
              <input
                type="text"
                placeholder="Key"
                className="w-full bg-transparent px-1 py-1 font-mono text-xs focus:outline-none text-zinc-500 pointer-events-none"
              />
            </td>
            <td className="border-r border-[#2e2e2e]" style={{ padding: "4px 16px" }}>
              <input
                type="text"
                placeholder="Value"
                className="w-full bg-transparent px-1 py-1 font-mono text-xs focus:outline-none text-zinc-500 pointer-events-none"
              />
            </td>
            <td style={{ padding: "4px 16px" }}>
              <span className="text-zinc-500 text-[11px] italic px-1 block py-1">Description</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="flex flex-col gap-2.5 shrink-0 font-sans text-xs">
      <div className="flex items-center justify-between gap-3 select-none">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-bold text-zinc-300 tracking-wide">Body</span>
          <select value={bodyType} onChange={(event) => onChangeBodyType(event.target.value as RequestBodyType)} className="max-w-[220px] bg-[#222222] border border-[#333333] rounded px-2.5 py-1.5 text-zinc-200 focus:outline-none cursor-pointer">
            {BODY_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </div>
        {bodyType === "json" && <button onClick={formatJson} className="px-3 py-1 bg-[#242424] hover:bg-[#2e2e2e] border border-[#333333] rounded text-zinc-300 font-semibold transition-colors">Beautify JSON</button>}
      </div>

      {bodyType === "none" && <div className="border border-[#383838] rounded-lg bg-[#202020] px-4 py-8 text-center text-zinc-500">No request body will be sent.</div>}

      {["json", "text", "html", "xml"].includes(bodyType) && (
        <div className="border border-[#383838] rounded-lg bg-[#202020] overflow-hidden shadow-sm">
          <textarea value={body} onChange={(event) => onChangeBody(event.target.value)} rows={10} placeholder={BODY_PLACEHOLDERS[bodyType]} className="w-full bg-transparent p-4 font-mono text-xs text-zinc-200 leading-relaxed focus:outline-none resize-y min-h-[160px]" spellCheck={false} />
        </div>
      )}

      {["form-data", "x-www-form-urlencoded"].includes(bodyType) && renderFormFields()}

      {bodyType === "binary" && (
        <div
          className="border border-[#3c3c3c] border-dashed rounded-lg bg-[#202020] flex flex-col items-center justify-center gap-5 transition-colors min-h-[280px]"
        >
          <input ref={fileInputRef} type="file" className="hidden" onChange={chooseBinaryFile} />

          {binary ? (
            <div className="flex flex-col items-center gap-2">
              <p className="text-zinc-200 font-semibold text-sm">{binary.name}</p>
              <p className="text-zinc-500 text-xs">{binary.mime_type || "application/octet-stream"}</p>

              <div className="flex gap-3 mt-4">
                <button onClick={() => fileInputRef.current?.click()} className="bg-[#242424] hover:bg-[#2e2e2e] border border-[#333333] rounded-sm text-zinc-200 font-medium text-xs transition-colors w-32 h-10">Change File</button>
                <button onClick={() => onChangeBinary(undefined)} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-sm font-medium text-xs transition-colors w-32 h-10">Remove</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <p className="text-zinc-300 font-medium text-sm">Select a file to upload</p>

              <button onClick={() => fileInputRef.current?.click()} className="bg-[#3467d6] hover:bg-[#4076e6] active:bg-[#2958bf] rounded-sm text-white font-medium text-sm transition-colors shadow-sm flex items-center justify-center w-[220px] h-12">Browse Files</button>

              <p className="text-zinc-500 text-xs max-w-[280px] text-center leading-relaxed mt-2">This file will be sent as the raw request body. The file type is automatically detected.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
