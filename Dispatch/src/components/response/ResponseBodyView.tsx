import { JsonHighlighter } from "./JsonHighlighter";
import { JsonPreviewTable } from "./JsonPreviewTable";
import { TextResponseViewer } from "./TextResponseViewer";
import {
  binaryHexPreview,
  prettyJson,
  responseDataUrl,
  type ResponseBodyKind,
} from "../../utils/responseUtils";

export type ResponseBodyMode = "pretty" | "raw" | "preview";

interface ResponseBodyViewProps {
  mode: ResponseBodyMode;
  kind: ResponseBodyKind;
  body: string;
  bodyBase64?: string | null;
  contentType?: string;
  size: number;
}

const EmptyBody = () => (
  <div className="flex flex-1 items-center justify-center text-xs text-zinc-500">Response body is empty.</div>
);

function BinaryPreview({
  kind,
  dataUrl,
  contentType,
  size,
}: {
  kind: ResponseBodyKind;
  dataUrl: string | null;
  contentType?: string;
  size: number;
}) {
  if (!dataUrl) return <BinarySummary contentType={contentType} size={size} dataUrl={null} />;
  if (kind === "image") {
    return <div className="flex flex-1 items-center justify-center overflow-auto bg-[#1d1d1d] p-6"><img src={dataUrl} alt="Response preview" className="max-h-full max-w-full object-contain" /></div>;
  }
  if (kind === "audio") {
    return <div className="flex flex-1 items-center justify-center p-8"><audio controls src={dataUrl} className="w-full max-w-xl" /></div>;
  }
  if (kind === "video") {
    return <div className="flex flex-1 items-center justify-center overflow-auto bg-black p-4"><video controls src={dataUrl} className="max-h-full max-w-full" /></div>;
  }
  if (kind === "pdf") {
    return <iframe title="PDF response preview" src={dataUrl} className="h-full flex-1 border-0 bg-white" />;
  }
  return <BinarySummary contentType={contentType} size={size} dataUrl={dataUrl} />;
}

function BinarySummary({ contentType, size, dataUrl }: { contentType?: string; size: number; dataUrl: string | null }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <div className="rounded-lg border border-[#3b3b3b] bg-[#202020] px-6 py-5">
        <p className="text-sm font-semibold text-zinc-200">Binary response</p>
        <p className="mt-1 font-mono text-[11px] text-zinc-500">{contentType || "application/octet-stream"} · {size} bytes</p>
        {dataUrl && <a href={dataUrl} download="dispatch-response" className="mt-4 inline-flex h-8 items-center rounded-md bg-[#ff6c37] px-4 text-xs font-semibold text-white hover:bg-[#ff7a47]">Download</a>}
      </div>
    </div>
  );
}

export function ResponseBodyView({ mode, kind, body, bodyBase64, contentType, size }: ResponseBodyViewProps) {
  if (kind === "empty") return <EmptyBody />;
  const dataUrl = responseDataUrl(contentType, body, bodyBase64);

  if (mode === "raw") {
    return <TextResponseViewer text={bodyBase64 ? binaryHexPreview(bodyBase64) : body} />;
  }
  if (mode === "preview") {
    if (kind === "json") return <JsonPreviewTable body={body} contentType={contentType} />;
    if (kind === "html") return <iframe title="HTML response preview" sandbox="" srcDoc={body} className="h-full flex-1 border-0 bg-white" />;
    if (["image", "audio", "video", "pdf", "binary"].includes(kind)) {
      return <BinaryPreview kind={kind} dataUrl={dataUrl} contentType={contentType} size={size} />;
    }
    return <TextResponseViewer text={body} />;
  }
  if (kind === "json") return <JsonHighlighter code={prettyJson(body).value} />;
  if (["image", "audio", "video", "pdf", "binary"].includes(kind)) {
    return <BinaryPreview kind={kind} dataUrl={dataUrl} contentType={contentType} size={size} />;
  }
  return <TextResponseViewer text={body} />;
}
