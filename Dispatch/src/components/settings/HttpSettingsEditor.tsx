import type {
  GlobalHttpSettings,
  HttpVersionPreference,
  RequestHttpSettings,
} from "../../types/httpSettings";
import { resolveHttpSettings } from "../../types/httpSettings";
import type { CookieCredentials } from "../../types/cookie";

type Platform = "desktop" | "web";

const versionLabel = (value: HttpVersionPreference) =>
  value === "http1" ? "HTTP/1.1" : value === "http2" ? "HTTP/2" : "Auto";

const SettingRow = ({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) => (
  <div className="grid grid-cols-[minmax(0,1fr)_210px] gap-8 border-b border-[#343434] py-2.5 last:border-0">
    <div className="min-w-0">
      <p className="text-[13px] font-semibold text-zinc-200">{title}</p>
      <p className="mt-0.5 text-xs leading-4 text-zinc-500">{description}</p>
    </div>
    <div className="flex min-h-8 flex-col items-end justify-center gap-1">{children}</div>
  </div>
);

export const SettingsToggle = ({ checked, onChange, disabled = false, label }: { checked: boolean; onChange: () => void; disabled?: boolean; label?: string }) => (
  <button
    type="button"
    role="switch"
    aria-label={label}
    aria-checked={checked}
    disabled={disabled}
    onClick={onChange}
    className={`relative h-5 w-9 rounded-full transition ${checked ? "bg-[#ff6c37]" : "bg-[#454545]"} disabled:cursor-not-allowed disabled:opacity-40`}
  >
    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
  </button>
);

const BrowserManaged = () => <span className="text-[11px] font-medium text-zinc-500">Tarayıcı yönetir</span>;
const WorkspaceManaged = () => <span className="text-[11px] font-medium text-zinc-500">Workspace cookie jar</span>;

export function GlobalHttpSettingsEditor({
  value,
  onChange,
  platform,
}: {
  value: GlobalHttpSettings;
  onChange: (value: GlobalHttpSettings) => void;
  platform: Platform;
}) {
  const desktop = platform === "desktop";
  return (
    <div>
      <SettingRow title="HTTP version" description="Request gönderilirken kullanılacak HTTP protokolünü seçer.">
        {desktop ? (
          <select value={value.http_version} onChange={(event) => onChange({ ...value, http_version: event.target.value as HttpVersionPreference })} className="h-8 w-40 rounded-lg border border-[#484848] bg-[#202020] px-3 text-xs text-zinc-200 outline-none focus:border-[#ff6c37]">
            <option value="auto">Auto</option><option value="http1">HTTP/1.1</option><option value="http2">HTTP/2</option>
          </select>
        ) : <BrowserManaged />}
      </SettingRow>
      <SettingRow title="SSL certificate verification" description="Geçersiz veya güvenilmeyen TLS sertifikalarında request'i durdurur.">
        {desktop ? <SettingsToggle checked={value.verify_ssl} onChange={() => onChange({ ...value, verify_ssl: !value.verify_ssl })} /> : <BrowserManaged />}
      </SettingRow>
      <SettingRow title="Automatically follow redirects" description="HTTP 3xx response'larını yeni hedefe otomatik olarak takip eder.">
        <SettingsToggle checked={value.follow_redirects} onChange={() => onChange({ ...value, follow_redirects: !value.follow_redirects })} />
      </SettingRow>
      <SettingRow title="Remove Referer on redirect" description="Redirect zincirinde Referer bilgisinin gönderilmesini engeller.">
        <SettingsToggle checked={value.remove_referer_on_redirect} onChange={() => onChange({ ...value, remove_referer_on_redirect: !value.remove_referer_on_redirect })} />
      </SettingRow>
      <SettingRow title="Maximum number of redirects" description="Takip edilecek redirect sayısına üst sınır koyar.">
        {desktop ? (
          <input type="number" min={1} max={100} disabled={!value.follow_redirects} value={value.max_redirects} onChange={(event) => onChange({ ...value, max_redirects: Math.min(100, Math.max(1, Number(event.target.value) || 1)) })} className="h-8 w-24 rounded-lg border border-[#484848] bg-[#202020] px-3 text-right text-xs text-zinc-200 outline-none focus:border-[#ff6c37] disabled:opacity-40" />
        ) : <BrowserManaged />}
      </SettingRow>
      <SettingRow title="Cookie credentials" description="Cookie'lerin request ile gönderilme politikasını belirler.">
        {desktop ? <WorkspaceManaged /> : (
          <select value={value.cookie_credentials} onChange={(event) => onChange({ ...value, cookie_credentials: event.target.value as CookieCredentials })} className="h-8 w-40 rounded-lg border border-[#484848] bg-[#202020] px-3 text-xs text-zinc-200 outline-none focus:border-[#ff6c37]">
            <option value="omit">Omit</option><option value="same-origin">Same origin</option><option value="include">Include</option>
          </select>
        )}
      </SettingRow>
    </div>
  );
}

export function RequestHttpSettingsEditor({
  value,
  globalSettings,
  onChange,
  platform,
}: {
  value: RequestHttpSettings;
  globalSettings: GlobalHttpSettings;
  onChange: (value: RequestHttpSettings) => void;
  platform: Platform;
}) {
  const resolved = resolveHttpSettings(globalSettings, value);
  const desktop = platform === "desktop";
  const clear = (key: keyof RequestHttpSettings) => {
    const next = { ...value };
    delete next[key];
    onChange(next);
  };
  const footer = (key: keyof RequestHttpSettings, label: string) =>
    value[key] == null ? (
      <span className="text-[10px] text-zinc-600">Global: {label}</span>
    ) : (
      <button type="button" onClick={() => clear(key)} className="text-[10px] text-[#ff8a61] hover:underline">Global ayara dön</button>
    );

  return (
    <div className="rounded-lg border border-[#383838] bg-[#222] px-4">
      <SettingRow title="HTTP version" description="Sadece bu request için HTTP protokolünü değiştirir.">
        {desktop ? <>
          <select value={value.http_version ?? ""} onChange={(event) => event.target.value ? onChange({ ...value, http_version: event.target.value as HttpVersionPreference }) : clear("http_version")} className="h-8 w-44 rounded-lg border border-[#484848] bg-[#202020] px-3 text-xs text-zinc-200 outline-none focus:border-[#ff6c37]">
            <option value="">Global ({versionLabel(globalSettings.http_version)})</option><option value="auto">Auto</option><option value="http1">HTTP/1.1</option><option value="http2">HTTP/2</option>
          </select>
        </> : <BrowserManaged />}
      </SettingRow>
      <SettingRow title="SSL certificate verification" description="Kapalı olduğunda self-signed sertifikalara izin verir; yalnızca geliştirme ortamında kullan.">
        {desktop ? <><SettingsToggle checked={resolved.verify_ssl} onChange={() => onChange({ ...value, verify_ssl: !resolved.verify_ssl })} />{footer("verify_ssl", globalSettings.verify_ssl ? "On" : "Off")}</> : <BrowserManaged />}
      </SettingRow>
      <SettingRow title="Automatically follow redirects" description="Bu request için HTTP 3xx redirect davranışını belirler.">
        <SettingsToggle checked={resolved.follow_redirects} onChange={() => onChange({ ...value, follow_redirects: !resolved.follow_redirects })} />
        {footer("follow_redirects", globalSettings.follow_redirects ? "On" : "Off")}
      </SettingRow>
      <SettingRow title="Remove Referer on redirect" description="Redirect sırasında hedef sunucuya Referer bilgisinin gönderilmesini engeller.">
        <SettingsToggle checked={resolved.remove_referer_on_redirect} onChange={() => onChange({ ...value, remove_referer_on_redirect: !resolved.remove_referer_on_redirect })} />
        {footer("remove_referer_on_redirect", globalSettings.remove_referer_on_redirect ? "On" : "Off")}
      </SettingRow>
      <SettingRow title="Maximum number of redirects" description="Bu request'in takip edebileceği redirect sayısını sınırlar.">
        {desktop ? <>
          <input type="number" min={1} max={100} disabled={!resolved.follow_redirects} value={value.max_redirects ?? ""} placeholder={String(globalSettings.max_redirects)} onChange={(event) => event.target.value ? onChange({ ...value, max_redirects: Math.min(100, Math.max(1, Number(event.target.value) || 1)) }) : clear("max_redirects")} className="h-8 w-24 rounded-lg border border-[#484848] bg-[#202020] px-3 text-right text-xs text-zinc-200 outline-none focus:border-[#ff6c37] disabled:opacity-40" />
          {footer("max_redirects", String(globalSettings.max_redirects))}
        </> : <BrowserManaged />}
      </SettingRow>
      <SettingRow title="Cookie credentials" description="Web fetch request'i için cookie gönderme politikasını değiştirir.">
        {desktop ? <WorkspaceManaged /> : <>
          <select value={value.cookie_credentials ?? ""} onChange={(event) => event.target.value ? onChange({ ...value, cookie_credentials: event.target.value as CookieCredentials }) : clear("cookie_credentials")} className="h-8 w-44 rounded-lg border border-[#484848] bg-[#202020] px-3 text-xs text-zinc-200 outline-none focus:border-[#ff6c37]">
            <option value="">Global ({globalSettings.cookie_credentials})</option><option value="omit">Omit</option><option value="same-origin">Same origin</option><option value="include">Include</option>
          </select>
          {footer("cookie_credentials", globalSettings.cookie_credentials)}
        </>}
      </SettingRow>
    </div>
  );
}
