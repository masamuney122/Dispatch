# Dispatch Workspace Architecture

## Amaç

Dispatch masaüstü uygulamasını, ileride geliştirilecek PWA ile aynı proje klasörünü okuyup yazabilecek hâle getirmek.
Uygulama kodu ve kullanıcı verisi birbirinden ayrılır: Dispatch kurulumu değişebilir veya güncellenebilir; kullanıcının
workspace klasörü ise bağımsız, taşınabilir ve sürümlenmiş bir veri formatı olarak kalır.

Bu doküman Faz 1 (yerel workspace temeli) ve Faz 2 (`.dispatch` içe/dışa aktarma) kapsamını tanımlar.
OpenAPI dönüşümü ayrı bir Faz 3'tür; workspace altyapısı tamamlanmadan veri modeline karıştırılmaz.

## Temel kararlar

- Diskteki workspace dosyaları collection ve environment verisinin asıl kaynağıdır.
- Masaüstü ve PWA aynı dosya formatını kullanır.
- History, seçili environment ve pencere/UI tercihleri cihaza özeldir; workspace'e yazılmaz.
- Her JSON dosyasında `schema_version` bulunur. Böylece ileride migration uygulanabilir.
- JSON kaydı doğrudan hedef dosyanın üstüne yazılmaz; geçici dosya yazılıp hedefle değiştirilir.
- Faz 1 mevcut request/collection modellerini değiştirmez. Var olan veriler yalnızca sürümlü zarflara alınır.
- Bir workspace aynı anda iki uygulamada açıksa otomatik eşzamanlı düzenleme garanti edilmez. `revision` alanı
  çakışmayı fark etmek için temel sağlar; gerçek zamanlı ortak çalışma bu fazların dışında kalır.

## Workspace dizini

```text
Payment API/
├── dispatch.workspace.json
├── collections.json
├── environments.json
└── assets/
```

`assets/` başlangıçta boş olabilir. İleride request gövdelerinde kullanılan dosyalar veya workspace'e ait ek
kaynaklar burada tutulabilir.

### `dispatch.workspace.json`

```json
{
  "format": "dispatch-workspace",
  "schema_version": 1,
  "id": "2e51e0f8-d4bc-4c21-bde4-70db53e2387f",
  "name": "Payment API",
  "created_at": "2026-08-21T08:00:00Z",
  "updated_at": "2026-08-21T08:00:00Z"
}
```

`format`, yanlış bir klasörün workspace olarak açılmasını engeller. `id`, klasörün adı veya konumu değişse bile
workspace'i tanımaya yarar.

### `collections.json`

```json
{
  "schema_version": 1,
  "workspace_id": "2e51e0f8-d4bc-4c21-bde4-70db53e2387f",
  "revision": 0,
  "updated_at": "2026-08-21T08:00:00Z",
  "collections": []
}
```

### `environments.json`

```json
{
  "schema_version": 1,
  "workspace_id": "2e51e0f8-d4bc-4c21-bde4-70db53e2387f",
  "revision": 0,
  "updated_at": "2026-08-21T08:00:00Z",
  "environments": []
}
```

`revision`, ilgili dosya her başarıyla kaydedildiğinde artırılır. Collection ve environment dosyaları birbirinden
bağımsız kaydedilebildiği için tek bir global revision yerine dosya başına revision kullanılır.

## Cihaza özel uygulama verisi

Tauri'nin app-data dizininde aşağıdaki yapı tutulur:

```text
app-settings.json
history/
└── <workspace-id>.json
```

Örnek ayar dosyası:

```json
{
  "schema_version": 1,
  "last_workspace_path": "/Users/example/Payment API",
  "recent_workspaces": [
    {
      "id": "2e51e0f8-d4bc-4c21-bde4-70db53e2387f",
      "name": "Payment API",
      "path": "/Users/example/Payment API",
      "last_opened_at": "2026-08-21T08:00:00Z"
    }
  ],
  "active_environment_by_workspace": {
    "2e51e0f8-d4bc-4c21-bde4-70db53e2387f": "environment-id"
  }
}
```

Bu ayrım sayesinde repository'ye veya başka bir kullanıcıya gönderilen workspace, kişisel history ve UI durumunu
taşımaz.

## Faz 1 — Workspace temeli

### Backend bileşenleri

1. `WorkspaceManifest`, `CollectionsDocument`, `EnvironmentsDocument`, `WorkspaceSession` ve `AppSettings`
   modelleri oluşturulur.
2. Ortak JSON storage servisi atomik okuma/yazma ve şema doğrulaması sağlar.
3. `RuntimeState`, açık workspace oturumunu ve yerel ayarları tutar.
4. Tauri komutları eklenir:
   - `create_workspace(path, name)`
   - `open_workspace(path)`
   - `close_workspace()`
   - `get_current_workspace()`
   - `list_recent_workspaces()`
5. Collection ve environment komutları app-data yerine aktif workspace dosyalarını kullanır.
6. History, workspace kimliğine göre app-data altındaki ayrı dosyada tutulur.

Bir workspace açık değilken collection, environment ve history komutları anlaşılır bir hata döndürür. Böylece veri
yanlışlıkla eski global dosyalara yazılmaz.

### Frontend akışı

- Uygulama açıldığında son workspace güvenle yeniden açılabiliyorsa doğrudan devam eder.
- Aksi durumda Workspace Launcher gösterilir: Yeni Oluştur, Klasör Aç, Son Kullanılanlar.
- Workspace değiştiğinde `ApiClientLayout`, workspace kimliğiyle yeniden mount edilir; önceki workspace'in React state'i
  yeni workspace'e sızmaz.
- Environment için bekleyen debounce kayıtları kapatma, değiştirme ve export işlemlerinden önce flush edilir.
- Kaydedilmemiş request tab'leri varsa workspace değiştirmeden önce kullanıcıdan onay alınır.

### Faz 1 kabul ölçütleri

- Yeni bir klasörde geçerli ve boş workspace oluşturulabiliyor.
- Uygulama kapatılıp açıldığında son workspace tekrar bulunabiliyor.
- Collection ve environment değişiklikleri workspace JSON dosyalarına atomik kaydediliyor.
- İki farklı workspace arasında veri karışmadan geçiş yapılabiliyor.
- Bozuk veya desteklenmeyen manifest anlaşılır hata veriyor.
- Eski app-data migration sırasında silinmiyor.

## Faz 2 — `.dispatch` import/export

`.dispatch`, uzantısı Dispatch'e özel olan bir ZIP arşividir:

```text
archive.json
workspace/
├── dispatch.workspace.json
├── collections.json
├── environments.json
└── assets/
```

### `archive.json`

```json
{
  "format": "dispatch-archive",
  "archive_version": 1,
  "exported_at": "2026-08-21T08:30:00Z",
  "workspace_id": "2e51e0f8-d4bc-4c21-bde4-70db53e2387f",
  "mode": "backup",
  "checksums": {
    "workspace/dispatch.workspace.json": "sha256:...",
    "workspace/collections.json": "sha256:...",
    "workspace/environments.json": "sha256:..."
  }
}
```

### Export modları

- **Backup:** Collection ve environment değerlerini eksiksiz taşır.
- **Safe Share:** Environment anahtarlarını korur fakat bütün değerleri boşaltır. Mevcut modelde hangi değişkenin secret
  olduğunu belirten alan bulunmadığı için yalnızca bazı değerleri gizlemek güvenli değildir.

Export'tan önce bekleyen frontend kayıtları flush edilir, JSON belgeleri yeniden okunup doğrulanır, checksum'lar
hesaplanır ve arşiv hedefe atomik olarak yazılır.

### Import güvenliği ve davranışı

Arşiv önce geçici bir dizine açılır. Import servisi:

- `../` içeren veya mutlak yolları,
- sembolik bağlantıları,
- izin verilmeyen kök girdilerini,
- belirlenen dosya boyutu, toplam boyut ve girdi sayısı sınırlarını,
- checksum, format ve schema uyuşmazlıklarını

reddeder. Kullanıcı import önizlemesinde workspace adını ve collection/environment sayılarını görür. Varsayılan işlem
"yeni workspace olarak içe aktar"dır ve yeni bir workspace kimliği üretir; mevcut workspace'in üstüne sessizce yazmaz.

### Faz 2 kabul ölçütleri

- Backup export/import round-trip veri kaybetmiyor.
- Safe Share arşivinde hiçbir environment değeri bulunmuyor.
- Bozuk checksum ve zip-slip denemeleri reddediliyor.
- Import mevcut bir dizinin üstüne onaysız yazmıyor.
- Başarısız import yarım workspace bırakmıyor.

## Uygulama sırası

1. Workspace modelleri ve atomik storage.
2. Workspace runtime state ve Tauri komutları.
3. Collection/environment/history path geçişi.
4. Workspace Launcher ve workspace değiştirme akışı.
5. `.dispatch` export, doğrulama ve Safe Share.
6. `.dispatch` import preview ve güvenli extraction.
7. Faz 3 olarak OpenAPI import/export için bağımsız dönüştürücü katmanı.

## OpenAPI için sonraki sınır

OpenAPI dosyası bir Dispatch workspace değildir. Faz 3'te `OpenAPI -> Dispatch models` ve `Dispatch models -> OpenAPI`
dönüştürücüleri eklenir. Bu dönüştürücüler doğrudan dosya yazmaz; önce bir import preview modeli üretir, kullanıcı
onayından sonra mevcut workspace servisleri üzerinden kayıt yapar. Environment üretimi de açık bir eşleme kuralına
bağlanır; örneğin server URL'leri seçilebilir environment değişkenlerine dönüştürülebilir.
