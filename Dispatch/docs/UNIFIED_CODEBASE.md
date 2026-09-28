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

## Ortak iş mantığı sınırı

Platformdan bağımsız ve iki runtime'da da aynı sonucu vermesi gereken dönüşümler
`rust/dispatch-core` içinde yaşar. Desktop bu crate'i native Rust bağımlılığı olarak,
web ise `rust/dispatch-web-wasm` üzerinden WebAssembly olarak çağırır.

Request değişken çözümleme de bu sınırı izler. URL, body, form alanları,
header ad/değerleri ve auth alanlarındaki `{{variable}}` ifadeleri
`dispatch-core` içinde tek geçişte çözülür. Web aynı fonksiyonu WASM üzerinden,
desktop ise ince bir Tauri command üzerinden çağırır. Kaydedilmiş request mutasyona
uğramaz ve eksik değişken listesi iki platformda da aynı şekilde üretilir.

Bearer, Basic, API key ve mevcut OAuth access token'ının URL/header'a uygulanması
da `dispatch-core` içindedir. Core yalnızca yeni bir hazırlanmış request üretir;
desktop bunu `reqwest`, web ise `fetch` ile gönderir. Cookie jar, redirect motoru,
multipart üretimi ve gerçek network çağrısı platform adapter'ında kalır.

Body tarafında core bir `PreparedBody` planı üretir: text, URL-encoded, form-data,
binary veya boş body. Varsayılan `Content-Type`, URL-encoded serializasyonu, boş
form anahtarlarının filtrelenmesi ve binary base64 doğrulaması burada tek kez
yapılır. Browser `FormData`/`Blob`, desktop `reqwest::multipart`/byte body üretir.

Global HTTP ayarları ile request seviyesindeki override'ların birleştirilmesi de
aynı hazırlık planının parçasıdır. Böylece redirect sınırı ve cookie credentials
gibi etkin değerler iki platformda aynı kuralla hesaplanır; SSL doğrulama ve HTTP
protokol seçimi gibi yeteneklerin uygulanması yine ilgili platforma aittir.

Response gövdesinin text, binary veya empty olarak sınıflandırılması MIME tipi ve
UTF-8 geçerliliğine göre `response_body` modülünde yapılır. Platformlar yalnızca
byte'ları decode/base64 eder. Böylece örneğin `application/problem+json` ve
`application/octet-stream` iki runtime'da farklı yorumlanmaz.

`Collection`, `Folder`, `SavedRequest`, `Environment`, workspace manifest ve belge
modelleri de core'un tek sahipliğindedir. Desktop bunları tekrar tanımlamaz ve
collection mutation öncesi/sonrası JSON round-trip yapmaz. Yeni workspace'in boş
bundle'ı da web ve desktop için aynı core factory ile oluşturulur.

İlk ortaklaştırılan dikey OpenAPI parse, önizleme, import ve export akışıdır:

```text
OpenAPI / Collection + options
           │
           ▼
      dispatch-core
           │
 collection / content + metadata
       ┌───┴───┐
       ▼       ▼
  native file  browser download
```

Core dosya seçmez, dosya yazmaz, browser download başlatmaz ve Tauri command
çağırmaz. Bunlar platform adapter'larında kalır. Böylece dönüşüm kuralının tek
sahibi olurken platform yetkileri birbirine karışmaz.

OpenAPI core tek bir büyük dosya değildir. Belge parse/serialize, inspect, import,
export modelleri ve aynı operation altında birleştirme davranışı ayrı modüllerde
tutulur. Import sırasında ID ve timestamp platform adapter'ından verilir; operation,
parameter, body, auth, folder ve environment variable dönüşümleri yalnızca core'dadır.
Collection, import sonucu, uyarı ve export options tipleri de core sözleşmesidir.
Native adapter typed değerleri doğrudan core'a verir; eski JSON serialize/deserialize
round-trip'i yoktur. WASM bridge yalnızca JavaScript sınırında aynı typed sözleşmeyi
`serde_wasm_bindgen` ile çevirir.

Collection mutation kuralları da aynı core içinde paylaşılır. Collection, folder ve
request oluşturma/yeniden adlandırma/silme/çoğaltma ile drag-and-drop sıralaması
`collection_mutation` modülünden geçer. Web adapter sonucu File System Access API ile,
desktop adapter ise atomik native dosya yazımıyla kaydeder. ID ve timestamp yine
platform adapter'ı tarafından sağlanır.

Environment create/update/delete ve aktif seçim doğrulaması da `environment_mutation`
üzerinden yürür. Core environment adlarını ve variable anahtarlarını doğrular,
workspace bağını korur ve aktif environment silindiğinde seçimi temizler. IndexedDB,
uygulama ayarları ve `environments.json` yazımı adapter sorumluluğundadır.

`ApiRequest`, authentication, body, request settings ve script modellerinin Rust
tarafındaki tek sahibi de `dispatch-core`dur. Tauri bu modelleri yeniden tanımlamaz;
native HTTP adapter'ı core modelini doğrudan `reqwest` isteğine çevirir. TypeScript
arayüzleri aynı JSON sözleşmesini temsil eder ve web adapter'ı bunları WASM'a aktarır.

## Web runtime

Web adapter'ı:

- request'leri `fetch` ile gönderir;
- workspace klasörünü File System Access API ile açar;
- directory handle, history ve aktif environment bilgisini IndexedDB'de saklar;
- HTTP ayarlarını LocalStorage'da saklar;
- workspace ve OpenAPI doğrulama için Rust/WASM kullanır;
- OpenAPI parse, önizleme, import ve export işlemlerini ortak Rust core'da çalıştırır;
- GitHub Pages base path'ine uyumlu service worker kaydeder.

`src/platform/web/services/wasmClient.ts` geriye uyumlu küçük bir export yüzeyidir.
WASM çağrıları `services/core` altında collection, environment, request, workspace ve
OpenAPI alanlarına ayrılır. Tek seferlik WASM başlatma ve ortak hata dönüşümü
`wasmRuntime.ts` içinde tutulur; böylece yeni core fonksiyonları tek bir büyüyen
istemci dosyasına eklenmez.

## Desktop runtime

Desktop adapter'ı Tauri command, dialog ve window API'lerini kullanır. HTTP, OAuth, native filesystem, atomik workspace kaydı ve `.dispatch` archive işlemleri `src-tauri` içinde kalır.

Platforma özel olması tek dosyada toplanması anlamına gelmez. Native servisler kendi
sınırları içinde modülerdir:

- `http_service` yalnız request akışını yönetir; reqwest client/request üretimi ve
  response decoding ayrı alt modüllerdedir.
- `cookie_service` jar ve workspace runtime state'ini yönetir; cookie normalize,
  header, expiry ve imza kuralları `record` modülündedir.
- `archive_service` import/export use-case'lerini yönetir; format limitleri/checksum,
  güvenlik doğrulamalı ZIP reader ve atomik ZIP/asset writer ayrıdır.
- Collection ve environment command'ları belge revision/schema/persistence ayrıntılarını
  bilmez; bu işlemler `workspace_document_service` üzerinden yürür. Core ile native
  environment modeli aynı tip olduğu için aralarında JSON round-trip yapılmaz.
- OAuth command yalnız Authorization Code + PKCE akışını orkestre eder. Loopback
  callback sunucusu ve işletim sistemi tarayıcı entegrasyonu ayrı alt modüllerdedir.

Bu modüller native yetkilere ihtiyaç duyduğu için ortak core'a taşınmaz; ancak parsing
ve orchestration sorumluluklarının birbirine karışması da engellenir.

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
