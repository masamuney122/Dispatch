export const DialogFrame: React.FC<{
  title: string;
  onClose: () => void;
  disabled?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}> = ({ title, onClose, disabled, wide, children }) => (
  <div
    className="fixed inset-0 z-[300] flex items-center justify-center bg-black/65 p-6"
    onMouseDown={() => !disabled && onClose()}
  >
    <div
      className={`max-h-[92vh] w-full overflow-y-auto rounded-xl border border-[#414141] bg-[#242424] p-6 shadow-2xl ${wide ? "max-w-[760px]" : "max-w-[560px]"}`}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-zinc-100">{title}</h2>
        <button
          type="button"
          disabled={disabled}
          onClick={onClose}
          className="rounded p-1 text-zinc-500 hover:bg-[#333] hover:text-white disabled:opacity-40"
        >
          ×
        </button>
      </div>
      {children}
    </div>
  </div>
);

export const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="mb-1.5 block text-[11px] font-semibold text-zinc-400">{label}</span>
    {children}
  </label>
);

export const inputClass =
  "h-9 w-full rounded-lg border border-[#404040] bg-[#202020] px-3 text-xs text-zinc-100 outline-none transition focus:border-[#ff6c37]/80";

export const PrimaryButton = ({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    {...props}
    className="h-9 rounded-lg bg-[#ff6c37] px-5 text-xs font-bold text-white transition hover:bg-[#ff7a47] disabled:cursor-not-allowed disabled:opacity-45"
  >
    {children}
  </button>
);

export const SecondaryButton = ({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    {...props}
    className="h-9 rounded-lg border border-[#464646] bg-[#2c2c2c] px-4 text-xs font-semibold text-zinc-300 transition hover:bg-[#333] disabled:opacity-45"
  >
    {children}
  </button>
);
