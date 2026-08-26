# Unified Codebase Architecture

## Hedef

Dispatch'in web ve desktop sürümleri tek React UI ve tek TypeScript model katmanı kullanır. Platform ayrımı source kopyalayarak değil adapter seçerek yapılır.

## Build seçimi

Vite `web` ve `desktop` modlarını destekler. `@platform/*` alias'ı build sırasında aşağıdaki dizinlerden birine çözülür:

```text
web      -> src/platform/web/services/*
desktop  -> src/platform/desktop/services/*
```

Ortak `src/services/*` dosyaları yalnızca bu implementasyonları dışa aktarır. Component'ler hangi implementasyonun seçildiğini bilmez.

## Ortak UI sınırı

- `App` ve `useWorkspaceSession` iki platformda aynıdır.
- Workspace seçimi ortak launcher'dan yapılır; native path veya browser directory handle adapter içinde kalır.
- Top navbar yalnızca platform capability bilgisine göre desteklenmeyen archive aksiyonlarını saklar.
- OpenAPI dialog'u dosya seçimini platform servisine bırakır.
- Gelişmiş HTTP ayarlarının görünümü capability üzerinden belirlenir.
- Tauri pencere sürükleme ve başlangıç davranışı desktop platform servisindedir.

## Web runtime

Web adapter'ı:

- request'leri `fetch` ile gönderir;
- workspace klasörünü File System Access API ile açar;
- directory handle, history ve aktif environment bilgisini IndexedDB'de saklar;
- HTTP ayarlarını LocalStorage'da saklar;
- workspace ve OpenAPI doğrulama için Rust/WASM kullanır;
- GitHub Pages base path'ine uyumlu service worker kaydeder.

## Desktop runtime

Desktop adapter'ı Tauri command, dialog ve window API'lerini kullanır. HTTP, OAuth, native filesystem, atomik workspace kaydı ve `.dispatch` archive işlemleri `src-tauri` içinde kalır.

## Yeni özellik ekleme

1. Ortak veri tipini `src/types` altında tanımla.
2. Ortak facade'nın beklediği fonksiyonu iki platform servisinde de uygula.
3. Desteklenmeyen platform için capability veya anlaşılır hata kullan.
4. UI'ı yalnızca ortak facade üzerinden bağla.
5. Hem `build:web` hem `build:desktop-ui` çalıştır.

## Kabul kontrolleri

- Web build Tauri runtime çağrısı çalıştırmamalıdır.
- Desktop build WASM veya service worker'a bağlı olmamalıdır.
- Aynı workspace desktop ve web tarafından veri kaybetmeden açılabilmelidir.
- Platforma özel yeni bir import ortak component'lere eklenmemelidir.
