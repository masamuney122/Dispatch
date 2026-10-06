import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/seed-dispatch-cookie-p0.mjs /path/to/collections.json");
  process.exit(1);
}

const file = resolve(target);
const document = JSON.parse(readFileSync(file, "utf8"));
const collection = document.collections?.find((item) => item.name === "Web HTTP Testleri (httpbin)");
if (!collection) throw new Error("Web HTTP Testleri (httpbin) collection was not found");

const parent = collection.folders?.find((item) => item.name === "09 - Cookies");
if (!parent) throw new Error("09 - Cookies folder was not found");

const folderId = "b9e4ed8a-48a3-4cb7-b30d-a47db00c0e01";
const now = new Date().toISOString();
const folder = {
  id: folderId,
  name: "P0 - Cookie Jar Uyumluluk",
  collection_id: collection.id,
  parent_folder_id: parent.id,
  order: 0,
  created_at: now,
  updated_at: now,
};

const ids = [
  "02f8435d-6801-4e4d-842c-baf71508a001", "02f8435d-6801-4e4d-842c-baf71508a002",
  "02f8435d-6801-4e4d-842c-baf71508a003", "02f8435d-6801-4e4d-842c-baf71508a004",
  "02f8435d-6801-4e4d-842c-baf71508a005", "02f8435d-6801-4e4d-842c-baf71508a006",
  "02f8435d-6801-4e4d-842c-baf71508a007", "02f8435d-6801-4e4d-842c-baf71508a008",
  "02f8435d-6801-4e4d-842c-baf71508a009", "02f8435d-6801-4e4d-842c-baf71508a00a",
  "02f8435d-6801-4e4d-842c-baf71508a00b", "02f8435d-6801-4e4d-842c-baf71508a00c",
  "02f8435d-6801-4e4d-842c-baf71508a00d", "02f8435d-6801-4e4d-842c-baf71508a00e",
  "02f8435d-6801-4e4d-842c-baf71508a00f", "02f8435d-6801-4e4d-842c-baf71508a010",
  "02f8435d-6801-4e4d-842c-baf71508a011", "02f8435d-6801-4e4d-842c-baf71508a012",
  "02f8435d-6801-4e4d-842c-baf71508a013", "02f8435d-6801-4e4d-842c-baf71508a014",
  "02f8435d-6801-4e4d-842c-baf71508a015",
];

const status200 = `pm.test("Status 200", () => {
  pm.expect(pm.response.code).to.equal(200);
});`;

const jsonTests = (body) => `const payload = pm.response.json();

${status200}

${body}`;

const specs = [
  ["01 - Temiz başlangıç", "DELETE", "http://localhost:8080/api/cookies/clear-test-cookies", status200],
  ["02 - Basit cookie kaydet", "GET", "http://localhost:8080/api/cookies/set?name=dispatch_session&value=initial&path=%2F&maxAge=3600&httpOnly=true&secure=false&sameSite=Lax", status200],
  ["03 - Basit cookie gönderimini doğrula", "GET", "http://localhost:8080/api/cookies/show", jsonTests(`pm.test("Cookie otomatik gönderildi", () => {
  pm.expect(payload.cookies.dispatch_session).to.equal("initial");
});`)],
  ["04 - Aynı cookie'yi güncelle", "GET", "http://localhost:8080/api/cookies/set?name=dispatch_session&value=updated&path=%2F&maxAge=3600&httpOnly=true&secure=false&sameSite=Lax", status200],
  ["05 - Cookie güncellemesini doğrula", "GET", "http://localhost:8080/api/cookies/show", jsonTests(`pm.test("Eski değer yenisiyle değiştirildi", () => {
  pm.expect(payload.cookies.dispatch_session).to.equal("updated");
});`)],
  ["06 - Path cookie kaydet", "GET", "http://localhost:8080/api/cookies/set?name=boundary_cookie&value=scoped&path=%2Fapi%2Fcookies%2Fpath&maxAge=3600&httpOnly=true&secure=false&sameSite=Lax", status200],
  ["07 - Path pozitif eşleşme", "GET", "http://localhost:8080/api/cookies/path/show", jsonTests(`pm.test("Cookie kendi path'inde gönderildi", () => {
  pm.expect(payload.cookies.boundary_cookie).to.equal("scoped");
});`)],
  ["08 - Alt path pozitif eşleşme", "GET", "http://localhost:8080/api/cookies/path/deep/show", jsonTests(`pm.test("Cookie alt path'te gönderildi", () => {
  pm.expect(payload.cookies.boundary_cookie).to.equal("scoped");
});`)],
  ["09 - Path sınırı negatif eşleşme", "GET", "http://localhost:8080/api/cookies/pathology/show", jsonTests(`pm.test("Benzer isimli farklı path'e cookie sızmadı", () => {
  pm.expect(JSON.stringify(payload.cookies)).to.not.include("boundary_cookie");
});`)],
  ["10 - Birden fazla Set-Cookie kaydet", "GET", "http://localhost:8080/api/cookies/set-multiple", jsonTests(`pm.test("Üç Set-Cookie üretildi", () => {
  pm.expect(payload.count).to.equal(3);
});`)],
  ["11 - Çoklu cookie root eşleşmesi", "GET", "http://localhost:8080/api/cookies/show", jsonTests(`pm.test("Root cookie'leri gönderildi", () => {
  pm.expect(payload.cookies.multi_root).to.equal("root");
  pm.expect(payload.cookies.multi_session).to.equal("session");
});

pm.test("Path cookie root'a gönderilmedi", () => {
  pm.expect(JSON.stringify(payload.cookies)).to.not.include("multi_path");
});`)],
  ["12 - Çoklu cookie path eşleşmesi", "GET", "http://localhost:8080/api/cookies/path/show", jsonTests(`pm.test("Path cookie doğru hedefe gönderildi", () => {
  pm.expect(payload.cookies.multi_path).to.equal("path");
});`)],
  ["13 - Secure cookie'yi HTTP üzerinden kaydet", "GET", "http://localhost:8080/api/cookies/set?name=secure_cookie&value=secret&path=%2F&maxAge=3600&httpOnly=true&secure=true&sameSite=Lax", status200],
  ["14 - Secure cookie HTTP negatif kontrol", "GET", "http://localhost:8080/api/cookies/show", jsonTests(`pm.test("Secure cookie HTTP isteğine eklenmedi", () => {
  pm.expect(JSON.stringify(payload.cookies)).to.not.include("secure_cookie");
});`)],
  ["15 - Redirect sırasında cookie kaydet", "GET", "http://localhost:8080/api/cookies/redirect", jsonTests(`pm.test("Redirect takip edildi", () => {
  pm.expect(payload.redirectFollowed).to.equal(true);
});

pm.test("Redirect cevabındaki cookie hedef isteğe eklendi", () => {
  pm.expect(payload.cookies.redirect_session).to.equal("saved-during-redirect");
});`), { follow_redirects: true }],
  ["16 - Redirect cookie kalıcılığını doğrula", "GET", "http://localhost:8080/api/cookies/show", jsonTests(`pm.test("Redirect cookie jar'da kaldı", () => {
  pm.expect(payload.cookies.redirect_session).to.equal("saved-during-redirect");
});`)],
  ["17 - Cookie sil", "DELETE", "http://localhost:8080/api/cookies/delete?name=dispatch_session&path=%2F", status200],
  ["18 - Cookie silinmesini doğrula", "GET", "http://localhost:8080/api/cookies/show", jsonTests(`pm.test("Silinen cookie artık gönderilmiyor", () => {
  pm.expect(JSON.stringify(payload.cookies)).to.not.include("dispatch_session");
});`)],
  ["19 - Uygulama yeniden açma testi için kaydet", "GET", "http://localhost:8080/api/cookies/set?name=persistent_cookie&value=survives-restart&path=%2F&maxAge=86400&httpOnly=true&secure=false&sameSite=Lax", status200],
  ["20 - MANUEL: Dispatch'i yeniden aç, sonra çalıştır", "GET", "http://localhost:8080/api/cookies/show", jsonTests(`pm.test("Kalıcı cookie uygulama yeniden açıldıktan sonra duruyor", () => {
  pm.expect(payload.cookies.persistent_cookie).to.equal("survives-restart");
});`)],
  ["21 - P0 cookie'lerini temizle", "DELETE", "http://localhost:8080/api/cookies/clear-test-cookies", status200],
];

const requests = specs.map(([name, method, url, postResponse, extraSettings], order) => ({
  id: ids[order],
  name,
  request: {
    method,
    url,
    body: "",
    body_type: "none",
    form_fields: [],
    binary: null,
    headers: {},
    auth: { type: "None" },
    settings: { cookie_credentials: "include", ...(extraSettings ?? {}) },
    scripts: { pre_request: "", post_response: postResponse },
  },
  folder_id: folderId,
  order,
  created_at: now,
  updated_at: now,
}));

collection.folders = [...(collection.folders ?? []).filter((item) => item.id !== folderId), folder];
collection.requests = [...(collection.requests ?? []).filter((item) => item.folder_id !== folderId), ...requests];
collection.updated_at = now;
document.updated_at = now;
document.revision = (document.revision ?? 0) + 1;

const backup = `${file}.before-cookie-p0`;
copyFileSync(file, backup);
writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
console.log(`Added ${requests.length} requests under ${parent.name} > ${folder.name}`);
console.log(`Backup: ${backup}`);
