import type { ReactNode } from "react";

export function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative border-b-2 px-3 pb-2.5 pt-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-[#ff6c37] font-semibold text-zinc-100"
          : "border-transparent text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {children}
    </button>
  );
}

export function PanelHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="text-center">
      <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
      <p className="mx-auto mt-2 max-w-[560px] text-xs leading-5 text-zinc-500">
        {description}
      </p>
    </div>
  );
}

export function FieldLabel({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-4">
        <span className="text-xs font-semibold text-zinc-300">{label}</span>
        {description && (
          <span className="text-right text-[11px] text-zinc-600">
            {description}
          </span>
        )}
      </span>
      <span className="mt-2.5 block">{children}</span>
    </label>
  );
}

interface PathFieldProps {
  label: string;
  description?: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onBrowse: () => Promise<void>;
  action?: ReactNode;
}

export function PathField({
  label,
  description,
  value,
  placeholder,
  onChange,
  onBrowse,
  action,
}: PathFieldProps) {
  return (
    <FieldLabel label={label} description={description}>
      <span className="flex flex-col gap-3 sm:flex-row">
        <span className="relative min-w-0 flex-1">
          <FolderIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            className={`${workspaceInputClassName} pl-10 font-mono text-xs`}
          />
        </span>
        <SecondaryButton type="button" onClick={() => void onBrowse()}>
          Select folder
        </SecondaryButton>
        {action}
      </span>
    </FieldLabel>
  );
}

interface FilePickerFieldProps {
  label: string;
  description?: string;
  value: string;
  placeholder: string;
  buttonLabel: string;
  onBrowse: () => Promise<void>;
  action?: ReactNode;
}

export function FilePickerField({
  label,
  description,
  value,
  placeholder,
  buttonLabel,
  onBrowse,
  action,
}: FilePickerFieldProps) {
  return (
    <FieldLabel label={label} description={description}>
      <span className="flex flex-col gap-3 sm:flex-row">
        <span className="flex h-9 min-w-0 flex-1 items-center gap-3 rounded-lg border border-[#404040] bg-[#202020] px-3">
          <ArchiveIcon className="h-4 w-4 shrink-0 text-zinc-600" />
          <span
            className={`truncate font-mono text-xs ${
              value ? "text-zinc-300" : "text-zinc-600"
            }`}
          >
            {value || placeholder}
          </span>
        </span>
        <SecondaryButton type="button" onClick={() => void onBrowse()}>
          {buttonLabel}
        </SecondaryButton>
        {action}
      </span>
    </FieldLabel>
  );
}

export function PreviewMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-w-[130px] flex-col justify-center border-t border-[#373737] px-5 py-4 sm:border-l sm:border-t-0">
      <span className="text-base font-semibold text-zinc-200">{value}</span>
      <span className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-600">
        {label}
      </span>
    </div>
  );
}

export function PrimaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-[#ff6c37] px-5 text-xs font-bold text-white shadow-[0_6px_18px_rgba(255,108,55,0.1)] transition hover:bg-[#ff7a47] active:bg-[#e85b2b] disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
    >
      {children}
    </button>
  );
}

export const workspaceInputClassName =
  "h-9 w-full rounded-lg border border-[#404040] bg-[#202020] px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 hover:border-[#494949] focus:border-[#ff6c37]/80 focus:ring-2 focus:ring-[#ff6c37]/10";

function SecondaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-[#464646] bg-[#2c2c2c] px-4 text-xs font-semibold text-zinc-300 transition hover:border-[#565656] hover:bg-[#333333] hover:text-white"
    >
      {children}
    </button>
  );
}

function FolderIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M3.5 6.5h6l2 2h9v9.5h-17z" />
    </svg>
  );
}

export function ArchiveIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M5 4h14v4H5zM6.5 8v11h11V8M10 12h4" />
    </svg>
  );
}

export function ArrowIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
