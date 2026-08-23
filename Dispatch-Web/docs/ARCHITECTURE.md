# Dispatch Web Architecture

## Ürün sınırı

`Dispatch-Web`, `Dispatch` masaüstü uygulamasından bağımsız derlenir ve deploy edilir. Kaynak paket veya build zinciri
paylaşılmaz. İki ürünün uyumluluk sözleşmesi yalnızca workspace formatıdır:

```text
dispatch.workspace.json
collections.json
environments.json
assets/
```

Bu karar desktop uygulamasını indiren kullanıcının web paketini, web deploy'unun da Tauri/Rust desktop binary'sini
taşımasını engeller.

## Çalışma zamanı

```text
React UI
├── Browser HTTP adapter ─────────────── fetch + CORS
├── Browser workspace adapter ───────── File System Access API
├── Local device state ──────────────── IndexedDB
└── Rust/WASM core
    ├── workspace format/schema validation
    ├── cross-file workspace id validation
    ├── model invariant validation
    └── environment template resolution
```

Rust/WASM ağ veya dosya sistemi yetkisine sahip değildir. Saf iş mantığını çalıştırır. JavaScript adaptörleri tarayıcı
izinlerini yönetir, sonucu WASM'e verir ve doğrulanan belgeyi UI'a taşır.

## Veri sahipliği

| Veri | Asıl kaynak | Desktop ile paylaşılır mı? |
| --- | --- | --- |
| Manifest | Workspace klasörü | Evet |
| Collections ve kayıtlı request'ler | `collections.json` | Evet |
| Environments | `environments.json` | Evet |
| Aktif environment | IndexedDB | Hayır |
| Request history | IndexedDB | Hayır |
| Son kullanılan directory handle'ları | IndexedDB | Hayır |
| PWA cache | Cache Storage | Hayır |

Environment değerleri workspace dosyasında düz metindir. Bu davranış desktop ile format uyumluluğu içindir; secret
vault değildir.

## Dosya yazma ve çakışma

Tarayıcı bir belgeyi kaydetmeden hemen önce diskteki `revision` değerini okur. UI'ın açtığı revision ile farklıysa
kayıt reddedilir. Pencere yeniden odaklandığında disk revision'ları kontrol edilir ve dış değişiklik varsa belgeler
yeniden yüklenir. File System Access API atomik rename garantisi vermediği için web adapter'ı desktop'ın atomik dosya
değiştirme semantiğini birebir sağlayamaz.

## HTTP sınırı

Request'ler doğrudan tarayıcı `fetch` API'siyle gönderilir. Ayrı backend veya CORS proxy yoktur. Sonuç olarak:

- hedef API web origin'ine CORS izni vermelidir;
- bazı header'lar tarayıcı tarafından yönetilir veya engellenir;
- yalnızca CORS ile expose edilen response header'ları okunabilir;
- client TLS sertifikası ve düşük seviyeli socket ayarları desteklenmez.

Service worker yalnızca uygulama navigasyonu ve statik asset'leri cache'ler. API `fetch` çağrıları, workspace içeriği,
environment değerleri ve history cache'e alınmaz.

## Kapsam sırası

1. **Tamamlandı:** bağımsız React/Vite/PWA temeli ve Rust/WASM build.
2. **Tamamlandı:** workspace açma/oluşturma, validation, IndexedDB handle saklama.
3. **Tamamlandı:** collection/request kaydı, environment düzenleme ve browser request/response akışı.
4. **Sonraki:** folder tree CRUD, drag/reorder ve desktop arayüzüne tam özellik eşliği.
5. **Sonraki:** `.dispatch` import/export.
6. **En son:** OpenAPI import/export.

OAuth 2.0 web sürümünde ayrı bir güvenlik ve redirect tasarımı yapılana kadar kapsam dışıdır.
