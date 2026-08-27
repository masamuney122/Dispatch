# Dispatch

<p align="center">
  <img src="public/branding/dispatch-wordmark-cropped.png" alt="Dispatch" width="360" />
</p>

Dispatch; HTTP request'leri oluşturmak, çalıştırmak, test etmek ve workspace'ler içinde düzenlemek için geliştirilen local-first bir API istemcisidir. Aynı React ve TypeScript codebase'i iki farklı hedef üretir:

- Tauri tabanlı masaüstü uygulaması
- Chromium tabanlı web/PWA uygulaması

Arayüz, veri modelleri ve uygulama akışı ortaktır. HTTP, dosya sistemi, cookie ve platform yetenekleri build sırasında seçilen adapter tarafından sağlanır. Böylece ayrı bir `dispatch-web` frontend'i tutulmaz.

> Proje aktif geliştirme aşamasındadır. Workspace formatı sürümlüdür; ancak henüz kararlı bir genel sürüm veya geriye dönük uyumluluk garantisi verilmemektedir.

## İçindekiler

- [Öne çıkan özellikler](#öne-çıkan-özellikler)
- [Web ve masaüstü farkları](#web-ve-masaüstü-farkları)
- [Tek codebase mimarisi](#tek-codebase-mimarisi)
- [Gereksinimler](#gereksinimler)
- [Hızlı başlangıç](#hızlı-başlangıç)
- [Temel kullanım](#temel-kullanım)
- [HTTP ve authentication desteği](#http-ve-authentication-desteği)
- [Environment değişkenleri](#environment-değişkenleri)
- [Cookie yönetimi](#cookie-yönetimi)
- [Pre-request ve post-response scriptleri](#pre-request-ve-post-response-scriptleri)
- [Workspace veri formatı](#workspace-veri-formatı)
- [OpenAPI ve `.dispatch` arşivleri](#openapi-ve-dispatch-arşivleri)
- [TestBackend ile manuel test](#testbackend-ile-manuel-test)
- [Komutlar ve doğrulama](#komutlar-ve-doğrulama)
- [Proje yapısı](#proje-yapısı)
- [Geliştirme kuralları](#geliştirme-kuralları)
- [Bilinen sınırlar](#bilinen-sınırlar)

## Öne çıkan özellikler

- GET, POST, PUT, PATCH, DELETE, HEAD ve OPTIONS request'leri
- Query parameter ve header tabloları
- JSON, text, HTML, XML, form-data, URL-encoded ve binary body desteği
- Bearer Token, Basic Auth, API Key ve OAuth 2.0
- Collection, iteratif folder ve request organizasyonu
- Collection/folder/request breadcrumb gösterimi
- Workspace bazlı environment'lar ve `{{variable}}` çözümleme
- Workspace'e göre ayrılmış request history
- Masaüstünde kalıcı Cookie Jar ve domain bazlı Cookie Manager
- Web'de tarayıcı tarafından yönetilen cookie credentials politikası
- Pre-request ve post-response JavaScript scriptleri
- Postman uyumlu `pm.*` API alt kümesi ve Dispatch `dp.*` alias'ı
- Script test sonuçları ve console kayıtları
- OpenAPI 3 JSON/YAML import ve collection export
- Masaüstünde `.dispatch` backup ve Safe Share arşivleri
- Dark ve light tema
- Aynı workspace klasörünü web ve masaüstünde kullanabilme
- Production web build'inde PWA manifest ve service worker

## Web ve masaüstü farkları

Ortak UI aynı olsa da tarayıcı güvenlik modeli nedeniyle bütün özellikler iki platformda aynı şekilde uygulanamaz.

| Alan | Masaüstü | Web/PWA |
| --- | --- | --- |
| HTTP motoru | Rust `reqwest` | Browser `fetch` |
| CORS | Tarayıcı CORS kısıtlaması yok | Endpoint CORS izni vermelidir |
| Workspace erişimi | Native filesystem | File System Access API |
| Tercih ve history | Tauri app-data | IndexedDB ve LocalStorage |
| Cookie | Workspace `cookies.json` Cookie Jar | Tarayıcı cookie store'u |
| `Cookie` / `Set-Cookie` görünürlüğü | Uygulama tarafından yönetilebilir | JavaScript tarafından okunamaz veya elle yazılamaz |
| HTTP sürümü seçimi | Auto, HTTP/1.1, HTTP/2 | Tarayıcı yönetir |
| SSL doğrulamasını kapatma | Desteklenir | Tarayıcı yönetir |
| Redirect üst sınırı | Ayarlanabilir | Tarayıcı yönetir |
| OAuth Authorization Code + PKCE | Desteklenir | Desteklenmez |
| OAuth Client Credentials / Password | Desteklenir | Token endpoint CORS izin verirse çalışır |
| `.dispatch` import/export | Desteklenir | Desteklenmez |
| OpenAPI import/export | Desteklenir | Desteklenir |

Web sürümü File System Access API kullandığı için geliştirme ve kullanımda güncel Chromium tabanlı bir tarayıcı önerilir. Bir workspace klasörü açılırken tarayıcı dizin okuma/yazma izni ister.

## Tek codebase mimarisi

Vite, çalıştırılan moda göre `@platform/*` alias'ını ilgili platform implementasyonuna bağlar:

```text
web      -> src/platform/web/services/*
desktop  -> src/platform/desktop/services/*
```

Ortak component ve hook'lar platformun Tauri mi yoksa browser mı olduğunu bilmez; yalnızca `src/services` facade'larını kullanır.

```text
React UI / hooks / ortak TypeScript modelleri
                     │
              src/services facade
                     │
          ┌──────────┴──────────┐
          │                     │
  Desktop adapter         Web adapter
  Tauri invoke/dialog     fetch/File System Access
  Rust + reqwest          IndexedDB/LocalStorage/WASM
```

Web tarafındaki workspace doğrulama ve OpenAPI yardımcıları Rust'tan WASM'e derlenir. Masaüstündeki native HTTP, filesystem, OAuth callback listener, cookie jar ve archive işlemleri `src-tauri` içinde kalır.

Daha ayrıntılı mimari belgeleri:

- [`docs/UNIFIED_CODEBASE.md`](docs/UNIFIED_CODEBASE.md)
- [`docs/WORKSPACE_ARCHITECTURE.md`](docs/WORKSPACE_ARCHITECTURE.md)

## Gereksinimler

### Ortak

- Node.js 22 veya üzeri
- npm
- Rust 1.85 veya üzeri (`rust/` crate'leri Rust 2024 edition kullanır)

### Web/WASM

- `wasm32-unknown-unknown` Rust target'ı
- `wasm-pack`
- File System Access API destekleyen güncel Chromium tabanlı tarayıcı

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --locked
```

### Masaüstü

- Rust toolchain
- Tauri 2'nin işletim sistemine özel sistem bağımlılıkları
- macOS'ta Xcode Command Line Tools

### TestBackend

- Java 25

Maven'ın ayrıca global kurulması gerekmez; sibling `TestBackend` projesi Maven Wrapper içerir.

## Hızlı başlangıç

Bağımlılıkları kur:

```bash
npm install
```

### Web geliştirme sunucusu

```bash
npm run dev:web
```

Bu komut önce web WASM paketini üretir, ardından Vite'ı web modunda `http://localhost:5173` adresinde başlatır.

`npm run dev` de `dev:web` komutunun alias'ıdır.

### Masaüstü uygulaması

```bash
npm run tauri dev
```

Tauri, `dev:desktop-ui` komutunu otomatik başlatır ve aynı frontend'i desktop adapter'larıyla açar.

### Production build

```bash
npm run build:web
npm run tauri build
```

Frontend çıktıları:

```text
dist/web/       deploy edilebilir web/PWA artifact'ı
dist/desktop/   Tauri tarafından paketlenen frontend
```

Web artifact'ını yerel olarak önizlemek için:

```bash
npm run preview:web
```

Alt path'e deploy edilecek web build'lerinde base path ayarlanabilir:

```bash
VITE_BASE_PATH=/dispatch/ npm run build:web
```

## Temel kullanım

1. Uygulamayı aç.
2. Yeni bir workspace için boş bir klasör seç veya mevcut Dispatch workspace klasörünü aç.
3. İstersen collection ve folder oluştur.
4. Method, URL, parametre, header, body ve authorization bilgilerini gir.
5. Gerekirse bir environment seç ve request alanlarında `{{variable_name}}` kullan.
6. Pre-request veya post-response script ekle.
7. `Send` ile request'i çalıştır.
8. Body, Cookies, Headers, Tests ve Console response sekmelerini incele.
9. Request'i collection'a kaydet.

Kaydedilmiş request açıldığında collection ve iç içe folder zinciri request panelinin üst kısmında breadcrumb olarak gösterilir.

## HTTP ve authentication desteği

### HTTP methodları

| Method | Destek |
| --- | --- |
| GET | Evet |
| POST | Evet |
| PUT | Evet |
| PATCH | Evet |
| DELETE | Evet |
| HEAD | Evet |
| OPTIONS | Evet |

GET, HEAD ve OPTIONS request'lerinde UI body göndermez.

### Body türleri

- None
- JSON
- Text
- HTML
- XML
- Form-data text alanları
- `application/x-www-form-urlencoded`
- Binary dosya

JSON body editörü geçersiz JSON'u yazım sırasında korur; `Beautify JSON` yalnızca parse edilebilen içerikleri formatlar.

### Authentication

| Tür | Açıklama |
| --- | --- |
| No Auth | Authorization eklemez |
| Bearer Token | `Authorization: Bearer ...` header'ı ekler |
| Basic Auth | Username/password bilgisini Basic header'a dönüştürür |
| API Key | Header veya query parameter olarak eklenebilir |
| OAuth 2.0 | Client Credentials, Password ve Authorization Code grant'leri |

Masaüstü Authorization Code akışı loopback callback listener ve PKCE S256 kullanır. Varsayılan redirect URI `http://127.0.0.1:8765/callback` değeridir. Web sürümü local callback listener açamadığı için Authorization Code token alma akışı kapalıdır; daha önce alınmış bir access token Bearer olarak gönderilebilir.

### Global ve request bazlı HTTP ayarları

- HTTP sürümü: Auto, HTTP/1.1 veya HTTP/2
- SSL certificate verification
- Redirect'leri otomatik takip etme
- Redirect sırasında Referer kaldırma
- Maksimum redirect sayısı
- Web cookie credentials: `omit`, `same-origin`, `include`

Request seviyesinde verilen ayarlar global varsayılanları override eder. Override kaldırıldığında request yeniden global değeri kullanır. Tarayıcının kontrol ettiği ayarlar web UI'da “Tarayıcı yönetir” olarak gösterilir.

## Environment değişkenleri

Environment'lar workspace içinde saklanır ve üst bardan aktif environment seçilir.

```text
{{base_url}}/users/{{user_id}}
```

Değişken çözümleme aşağıdaki alanlara uygulanır:

- URL
- Query parameter key ve value değerleri
- Header key ve value değerleri
- Text tabanlı body
- Form field key ve value değerleri
- Authentication alanları

Eksik bir değişken varsa request gönderilmez ve eksik isimler hata mesajında gösterilir. Binary payload değiştirilmez.

Pre-request script, değişken çözümlemeden önce çalışır. Böylece script `pm.environment.set(...)` ile bir değer kaydedebilir ve aynı request'in çözümleme aşamasında bu değeri kullanabilir.

## Cookie yönetimi

### Masaüstü Cookie Jar

Her workspace kendi `cookies.json` dosyasına sahiptir. Masaüstü HTTP client:

- Response'lardaki `Set-Cookie` değerlerini otomatik kaydeder.
- Domain, host-only, path, expiry ve Secure kurallarına uyan cookie'leri sonraki request'e ekler.
- Redirect zincirinde oluşan cookie'leri işler.
- Süresi dolmuş veya devre dışı cookie'leri göndermez.

Cookie Manager içinde domain eklenebilir; cookie oluşturulabilir, düzenlenebilir, etkinleştirilebilir, devre dışı bırakılabilir ve silinebilir. Desteklenen alanlar:

- Name ve value
- Domain ve path
- Expiry / Max-Age
- Secure
- HttpOnly
- SameSite: Strict, Lax veya None
- Host-only
- Enabled

### Web cookie davranışı

Tarayıcı JavaScript'e `Set-Cookie` response header'ını okutmaz ve uygulamanın `Cookie` request header'ını elle yazmasına izin vermez. Bu nedenle web sürümünde cookie değerleri Dispatch tarafından listelenmez; browser-managed olarak gösterilir.

Gönderim politikası global veya request bazında seçilir:

- `omit`: cookie gönderme ve kabul etme
- `same-origin`: yalnızca aynı origin için kullan
- `include`: cross-origin request'lerde de credentials kullan; sunucunun uygun CORS ve credential header'larını vermesi gerekir

## Pre-request ve post-response scriptleri

Kaydedilmiş request'ler iki JavaScript alanı taşıyabilir:

- **Pre-request:** Environment değişkenleri çözülmeden ve HTTP request gönderilmeden önce çalışır. Method, URL, query, header ve body değiştirilebilir.
- **Post-response:** Response alındıktan sonra çalışır. Assertion, environment güncellemesi ve console çıktısı üretilebilir.

Scriptler QuickJS içinde ayrı bir Web Worker'da çalışır. Runtime sınırları:

- Yaklaşık 1 saniye execution limiti
- 16 MiB memory limiti
- 512 KiB stack limiti
- `window`, `fetch`, `process`, Node ve Tauri host API'lerine erişim yok
- Async script ve async test desteği henüz yok

Pre-request script başarısız olursa HTTP request gönderilmez. Test assertion hataları ise `Tests` sekmesinde tek tek raporlanır. `console.log`, `console.info`, `console.warn` ve `console.error` çıktıları `Console` sekmesinde gösterilir.

### `pm.*` ve `dp.*`

`pm` ve `dp` aynı API nesnesine işaret eder:

```javascript
pm === dp; // true
```

Yeni scriptlerde Postman'dan geçişi kolaylaştırmak için `pm.*` önerilir. Mevcut Dispatch scriptleri için `dp.*` geriye uyumlu alias olarak tutulur. Bu uyumluluk Postman Sandbox'ın tamamı değil, belgelenmiş bir alt kümedir.

### Pre-request örneği

```javascript
pm.variables.set("trace_id", "dispatch-123");
pm.environment.set("last_client", "dispatch");

pm.request.method = "POST";
pm.request.headers.upsert({
  key: "X-Trace-Id",
  value: pm.variables.get("trace_id")
});
pm.request.url.query.upsert({ key: "source", value: "dispatch" });
pm.request.body.update({
  mode: "raw",
  raw: JSON.stringify({ feature: "scripts", enabled: true }),
  options: { raw: { language: "json" } }
});

console.log("Prepared", pm.request.method, pm.request.url.toString());
```

### Post-response örneği

```javascript
const payload = pm.response.json();

pm.test("Status 200", () => {
  pm.response.to.have.status(200);
});

pm.test("Response beklenen alanı içeriyor", () => {
  pm.expect(payload.enabled).to.equal(true);
  pm.expect(pm.response.headers.get("content-type")).to.contain("json");
});

console.info("Response time", pm.response.responseTime, "ms");
```

### Desteklenen script API özeti

| API | Desteklenen işlemler |
| --- | --- |
| `pm.request` | `method`, `url`, `body`, `headers`, `query` |
| `pm.request.headers` | `get`, `has`, `set`, `upsert`, `add`, `remove`, `all`, `each`, `toObject` |
| `pm.request.url.query` | `get`, `has`, `set`, `upsert`, `add`, `getAll`, `remove`, `all`, `each`, `toObject` |
| `pm.request.body` | `mode`, `raw`, `update`, `toString`, `toJSON` |
| `pm.response` | `status`, `code`, `responseTime`, `responseTimeMs`, `body`, `text`, `json`, `headers` |
| `pm.variables` | `get`, `has`, `set`, `unset`, `replaceIn` |
| `pm.environment` | `get`, `set`, `unset` |
| `pm.info` | `eventName`, `iteration`, `iterationCount` |
| Test | `pm.test`, `pm.expect`, `pm.response.to.have.status(...)` |
| Console | `log`, `info`, `warn`, `error` |

`pm.variables` yalnızca o script execution'ı süresince yaşar; pre-request ve post-response ayrı execution'lardır. `pm.environment` değişiklikleri aktif environment'a kaydedilir ve iki faz arasında taşınır.

Desteklenen assertion'lar arasında `equal`, `eql`, `include`, `contain`, `property`, `a/an`, `lengthOf`, `match`, `oneOf`, sayı karşılaştırmaları, `true/false/null/undefined`, `exist`, `empty`, `success`, `clientError`, `serverError`, response `status`, `header`, `body` ve `jsonBody` bulunur.

### Henüz desteklenmeyen Postman API'leri

- `pm.sendRequest`
- `pm.globals`
- `pm.collectionVariables`
- `pm.iterationData`
- `pm.cookies.jar`
- `pm.visualizer`
- `pm.execution.skipRequest`
- `pm.vault`
- Async script ve async `pm.test`

Bu API'ler sessizce yok sayılmaz; açıklayıcı bir runtime hatası üretir. Cookie işlemleri için Dispatch Cookie Manager kullanılmalıdır.

## Workspace veri formatı

Workspace, uygulama kurulumundan bağımsız taşınabilir bir klasördür:

```text
Payment API/
├── dispatch.workspace.json
├── collections.json
├── environments.json
├── cookies.json              # masaüstü Cookie Jar
└── assets/
```

- `dispatch.workspace.json`: workspace kimliği, adı ve schema bilgisi
- `collections.json`: collection, folder, request ve scriptler
- `environments.json`: environment isimleri ve değişkenleri
- `cookies.json`: masaüstü workspace Cookie Jar
- `assets/`: workspace'e ait ileride kullanılabilecek dosyalar

Collection ve environment belgeleri kendi `revision` değerlerini taşır. Masaüstünde dosya kayıtları geçici dosya + atomik replace yöntemiyle yapılır.

History, aktif environment seçimi, tema ve cihaz tercihleri workspace paylaşımına dahil edilmez:

- Masaüstünde Tauri app-data altında
- Web'de IndexedDB/LocalStorage içinde

Bir workspace'i aynı anda iki Dispatch instance'ında düzenlemek için gerçek zamanlı locking veya merge henüz yoktur. Aynı klasörü eşzamanlı yazmak veri çakışmasına neden olabilir.

## OpenAPI ve `.dispatch` arşivleri

### OpenAPI

OpenAPI 3 belgeleri JSON veya YAML olarak dosyadan ya da doğrudan metin olarak içe aktarılabilir. Import önizlemesi şunları gösterir:

- API title ve specification version
- Endpoint ve folder sayısı
- Server URL'leri
- Security scheme'leri
- Desteklenmeyen veya kayıplı dönüşümler için warning'ler

Import sırasında:

- Collection adı seçilebilir.
- Request isimlendirmesi ayarlanabilir.
- Folder organizasyonu tag veya path bazlı yapılabilir.
- Seçilen server URL'i için environment oluşturulabilir.
- Request body örnekleri ve desteklenen authentication scheme'leri Dispatch modeline dönüştürülür.

Collection, OpenAPI JSON veya YAML olarak dışa aktarılabilir. OpenAPI standardı pre-request/post-response script alanlarını tanımlamadığı için Dispatch scriptleri OpenAPI import/export işleminde taşınmaz.

Web implementasyonu parse/doğrulama için Rust/WASM, masaüstü implementasyonu native Rust kullanır.

### `.dispatch` archive

Bu özellik yalnızca masaüstündedir.

- **Backup:** Collection, environment ve cookie değerlerini eksiksiz taşır.
- **Safe Share:** Environment değerlerini boşaltır ve cookie'leri arşive dahil etmez.

Import işlemi arşiv formatını, schema version'ı, checksum'ları, dosya boyutlarını ve güvenli path kurallarını doğrular. Archive mevcut workspace'in üzerine sessizce yazılmaz; yeni bağımsız workspace olarak içe aktarılır.

## TestBackend ile manuel test

Repository'nin sibling dizinindeki `TestBackend`, Dispatch için Spring Boot tabanlı hedef sunucudur:

```text
Root/
├── Dispatch/
└── TestBackend/
```

Backend'i başlat:

```bash
cd ../TestBackend
./mvnw spring-boot:run
```

Sunucu `http://127.0.0.1:8080` adresini dinler. Ayrı bir terminalde smoke test çalıştırılabilir:

```bash
cd ../TestBackend
./scripts/smoke-test.sh
```

TestBackend şu alanlar için endpoint içerir:

- Bütün desteklenen HTTP methodları
- JSON, text, XML, form-data, URL-encoded ve binary body
- Query/header echo
- Basic, Bearer ve API Key authentication
- OAuth 2.0 Client Credentials, Password ve Authorization Code + PKCE
- Cookie kaydetme, gösterme, path eşleşmesi, redirect cookie'si ve temizleme
- Localhost web geliştirmesi için credential destekli CORS

Endpoint ve credential listesi için [`../TestBackend/README.md`](../TestBackend/README.md) belgesine bak.

Workspace içindeki `Web HTTP Testleri (httpbin) → 10 - Scripts` klasörü script runtime'ını UI üzerinden doğrulamak için manuel senaryolar içerir. “Beklenen assertion hatası”, “Beklenen pre-request runtime hatası” ve “Beklenen script timeout” request'leri bilinçli olarak başarısız olur.

## Komutlar ve doğrulama

| Komut | Açıklama |
| --- | --- |
| `npm run dev` | Web geliştirme sunucusu alias'ı |
| `npm run dev:web` | WASM build + web Vite dev server |
| `npm run dev:desktop-ui` | Yalnız desktop-mode frontend dev server |
| `npm run tauri dev` | Tauri masaüstü geliştirme uygulaması |
| `npm run wasm:build` | Web Rust crate'ini WASM paketine dönüştürür |
| `npm run build:web` | WASM + TypeScript + web production build |
| `npm run build:web:frontend` | Mevcut WASM ile yalnız web frontend build |
| `npm run build:desktop-ui` | TypeScript + desktop frontend build |
| `npm run tauri build` | Native masaüstü bundle üretir |
| `npm run preview:web` | `dist/web` için Vite preview |
| `npm run preview:desktop` | `dist/desktop` için Vite preview |
| `npm run lint` | ESLint |
| `npm run test:scripts` | QuickJS script runtime Vitest paketi |
| `npm run test:rust` | Ortak Rust workspace ve Tauri Rust testleri |
| `npm run check` | Lint + script testleri + Rust testleri + iki frontend build |

Tam doğrulama:

```bash
npm run check
```

Script testini hızlı çalıştırmak için:

```bash
npm run test:scripts
```

Otomatik script paketi şunları kapsar:

- Eski `dp.*` geriye uyumluluğu
- Değiştirilmeden çalışan `pm.*` request ve response syntax'ı
- Header, query, method ve body mutation
- Environment persistence ve local variables
- Response helper ve assertion zincirleri
- Runtime izolasyonu
- Desteklenmeyen Postman API hata mesajları
- Syntax/runtime hataları, timeout ve async reddi

## Proje yapısı

```text
Dispatch/
├── src/
│   ├── components/             Ortak React UI
│   │   ├── cookies/            Cookie Manager
│   │   ├── environment/        Environment UI
│   │   ├── layout/             Request/response ana arayüzü
│   │   ├── openapi/            OpenAPI dialog'ları
│   │   ├── scripts/            CodeMirror script editörü
│   │   ├── settings/           Global/request HTTP ayarları
│   │   └── workspace/          Workspace Launcher
│   ├── hooks/                  Ortak state ve yaşam döngüsü
│   ├── platform/
│   │   ├── desktop/services/   Tauri adapter'ları
│   │   └── web/                Browser/WASM adapter'ları
│   ├── services/               Platform-neutral facade'lar
│   ├── types/                  Ortak TypeScript modelleri
│   ├── utils/                  UI/model yardımcıları
│   └── workers/                QuickJS script sandbox
├── src-tauri/
│   └── src/
│       ├── commands/           Tauri command handler'ları
│       ├── models/             Rust modelleri
│       └── services/           HTTP, storage, cookie, archive, OpenAPI
├── rust/
│   ├── dispatch-web-core/      Saf Rust web ortak mantığı
│   └── dispatch-web-wasm/      wasm-bindgen köprüsü
├── public/                     Branding, PWA manifest ve service worker
├── docs/                       Ayrıntılı mimari belgeleri
├── vite.config.ts              Build-mode platform alias seçimi
└── package.json                npm workflow'ları
```

## Geliştirme kuralları

Yeni platform bağımlı bir özellik eklerken:

1. Ortak veri tipini `src/types` altında tanımla.
2. Ortak facade'yı `src/services` altında tut.
3. Davranışı hem `src/platform/desktop/services` hem `src/platform/web/services` için uygula.
4. Bir platform desteklemiyorsa capability ile UI'da gizle veya açıklayıcı hata döndür.
5. Ortak component/hook içinde doğrudan `@tauri-apps/*`, IndexedDB, File System Access API veya browser download kodu kullanma.
6. TypeScript ve Rust'ın paylaştığı modelleri birlikte güncelle.
7. En az `npm run lint`, ilgili test ve iki frontend build'ini çalıştır.

Yeni bir HTTP özelliği ekleniyorsa sibling `TestBackend` içinde ilgili test endpoint'i ve mümkünse backend testi de eklenmelidir.

## Bilinen sınırlar

- Web request'leri browser CORS kurallarına tabidir.
- File System Access API desteği nedeniyle web workspace akışı bütün tarayıcılarda çalışmaz.
- Web'de `Cookie` ve `Set-Cookie` değerleri uygulama tarafından okunamaz.
- Web'de OAuth Authorization Code callback listener yoktur.
- `.dispatch` archive işlemleri yalnızca masaüstünde kullanılabilir.
- Script runtime Postman Sandbox'ın tamamı değildir ve async çalıştırma desteklemez.
- OpenAPI import/export Dispatch scriptlerini taşımaz.
- Form-data şu anda text field odaklıdır; dosya alanları için binary body kullanılmalıdır.
- Aynı workspace'in eşzamanlı birden fazla instance tarafından düzenlenmesi otomatik merge edilmez.

Bir web request'i “Request tarayıcı tarafından gönderilemedi” hatası veriyorsa önce endpoint'in CORS ayarlarını, URL'i ve ağ erişimini kontrol et. `localhost:5173` doğrudan web modudur; Tauri API'leri yalnız `npm run tauri dev` ile açılan masaüstü runtime'ında bulunur.
