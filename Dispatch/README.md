# Dispatch

Dispatch, aynı React arayüzünü Tauri masaüstü uygulaması ve Chromium tabanlı web/PWA olarak çalıştıran local-first bir API istemcisidir.

## Mimari

Tek frontend `src/components`, `src/hooks`, `src/types` ve `src/services` altında yaşar. `src/services` modülleri ortak UI sözleşmesidir; Vite build moduna göre gerçek implementasyonu seçer:

```text
src/
├── components/                 ortak React UI
├── hooks/                      ortak uygulama state'i
├── services/                   platformdan bağımsız facade'lar
├── types/                      ortak TypeScript modelleri
└── platform/
    ├── desktop/services/       Tauri adapter'ları
    └── web/                    Browser, IndexedDB ve File System Access adapter'ları

rust/
├── dispatch-web-core/          workspace doğrulama ve saf Rust/WASM mantığı
└── dispatch-web-wasm/          browser WASM köprüsü

src-tauri/                      native HTTP, filesystem, OAuth ve archive servisleri
```

Web ve desktop aynı workspace dosya sözleşmesini kullanır. UI ortak olsa da platform yetenekleri farklıdır:

| Alan | Desktop | Web |
| --- | --- | --- |
| HTTP | Rust `reqwest` | Browser `fetch` ve CORS kuralları |
| Workspace | Native filesystem | File System Access API |
| History/ayarlar | Tauri app-data | IndexedDB/LocalStorage |
| Cookies | Workspace `cookies.json` jar; redirect dahil otomatik yönetim | Browser cookie store + Fetch credentials |
| OAuth authorization code | Desteklenir | Desteklenmez |
| `.dispatch` archive | Desteklenir | Desteklenmez |

Masaüstü Cookie Manager domain/path bazlı ekleme, düzenleme, devre dışı bırakma ve silme sunar. Cookie jar tam backup arşivlerine dahil edilir; hassas cookie değerleri Safe Share arşivlerine dahil edilmez. Web sürümünde `Cookie` ve `Set-Cookie` header'ları tarayıcı tarafından korunduğu için değerler gösterilmez; gönderim davranışı `omit`, `same-origin` veya `include` Fetch credentials politikasıyla yönetilir.

## Gereksinimler

- Node.js 22+
- Rust stable
- Web build için `wasm32-unknown-unknown` target ve `wasm-pack`
- Desktop için Tauri 2 sistem gereksinimleri

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --locked
npm install
```

## Geliştirme

Web:

```bash
npm run dev:web
```

Desktop:

```bash
npm run tauri dev
```

## Build ve kontroller

```bash
npm run build:web
npm run build:desktop-ui
npm run tauri build
npm run lint
npm run test:rust
```

Çıktılar:

```text
dist/web/       web/PWA deploy artifact'ı
dist/desktop/   Tauri'nin paketlediği frontend
```

`npm run check`, lint, ortak Rust testleri ve iki frontend build'ini birlikte çalıştırır.

## Platform kuralı

Ortak component veya hook içinde doğrudan `@tauri-apps/*`, IndexedDB, File System Access API ya da browser download kodu kullanılmamalıdır. Yeni platform davranışları ilgili `src/platform/<target>/services` implementasyonuna eklenmeli ve ortak facade üzerinden çağrılmalıdır.
