# Dispatch Web

Dispatch desktop uygulamasından bağımsız geliştirilen Chromium/PWA sürümüdür. İki uygulama kod paketi paylaşmaz;
uyumluluk sınırı `dispatch.workspace.json`, `collections.json` ve `environments.json` dosya sözleşmesidir.

## Çalışan MVP kapsamı

- React + TypeScript + Vite arayüzü
- Rust/WebAssembly ile workspace şema ve kimlik doğrulaması
- File System Access API ile workspace açma ve oluşturma
- Directory handle'larını IndexedDB'de saklayan son kullanılanlar listesi
- Collection oluşturma, request kaydetme ve kayıtlı request'i yeniden açma
- Environment oluşturma/düzenleme ve `{{variable}}` çözümleme
- Browser `fetch` adapter'ı ile CORS'un izin verdiği endpoint'lere request gönderme
- None, Bearer, Basic ve API Key authentication
- JSON, text, XML, multipart form-data, URL-encoded ve binary request body
- Response body/header/status/süre/boyut görünümü
- Workspace'e özel, yalnızca tarayıcıda saklanan request history
- Dosya `revision` çakışma kontrolü ve pencere odaklandığında desktop değişikliklerini yenileme
- PWA manifesti ve aynı origin uygulama kabuğu için service worker

OAuth 2.0, `.dispatch` import/export ve OpenAPI bu sürümün bilinçli olarak dışındadır.

## Gereksinimler

- Güncel Chromium tabanlı tarayıcı
- Rust `wasm32-unknown-unknown` target
- `wasm-pack`
- Node.js ve npm

## Çalıştırma

```bash
npm install
npm run dev
```

WASM çıktısını tek başına yenilemek için:

```bash
npm run wasm:build
```

Tüm kontroller:

```bash
npm run check
```

Localhost güvenli context kabul edilir. Yayında File System Access API için HTTPS gerekir. Uygulama seçilen klasörün
mutlak yolunu göremez; tarayıcı yalnızca klasör handle'ı ve adını verir.

Tarayıcı güvenlik modeli nedeniyle desktop sürümündeki gibi her endpoint'e erişim garanti edilmez. Hedef API'nin web
origin'ine CORS izni vermesi gerekir; proxy veya ayrı backend kullanılmaz.
