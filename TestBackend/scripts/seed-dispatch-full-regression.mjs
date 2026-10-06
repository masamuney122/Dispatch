import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const target = process.argv[2];
if (!target) throw new Error("Usage: node scripts/seed-dispatch-full-regression.mjs /path/to/collections.json");
const file = resolve(target);
const document = JSON.parse(readFileSync(file, "utf8"));
const collection = document.collections?.find((item) => item.name === "Web HTTP Testleri (httpbin)");
if (!collection) throw new Error("Web HTTP Testleri (httpbin) collection was not found");

const id = (seed) => {
  const value = createHash("sha256").update(`dispatch-regression:${seed}`).digest("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-a${value.slice(17, 20)}-${value.slice(20, 32)}`;
};
const now = new Date().toISOString();
const rootId = id("root");
const root = {
  id: rootId,
  name: "11 - Tam Regresyon (Local TestBackend)",
  collection_id: collection.id,
  parent_folder_id: null,
  order: 11,
  created_at: now,
  updated_at: now,
};
const child = (key, name, order) => ({
  id: id(`folder:${key}`),
  name,
  collection_id: collection.id,
  parent_folder_id: rootId,
  order,
  created_at: now,
  updated_at: now,
});
const folders = {
  smoke: child("smoke", "00 - P0 Başarılı Smoke", 0),
  methods: child("methods", "01 - Metotlar, Parametreler ve Header", 1),
  bodies: child("bodies", "02 - Body Türleri", 2),
  auth: child("auth", "03 - Authentication", 3),
  response: child("response", "04 - Status, Redirect ve Response", 4),
  scripts: child("scripts", "05 - Scripts, Tests ve Console", 5),
  cookies: child("cookies", "06 - Cookie Hızlı Kontrol", 6),
  runner: child("runner", "07 - Collection Runner", 7),
  expected: child("expected", "99 - Bilinçli Hata Senaryoları", 99),
};

const status = (code = 200) => `pm.test("Status ${code}", () => { pm.expect(pm.response.code).to.equal(${code}); });`;
const json = (assertions, code = 200) => `const payload = pm.response.json();\n${status(code)}\n${assertions}`;
const specs = [];
const add = (folder, key, order, name, url, overrides = {}) => {
  const { pre = "", post = status(), ...requestOverrides } = overrides;
  specs.push({
    id: id(`request:${key}`),
    name,
    request: {
      method: "GET",
      url,
      body: "",
      body_type: "none",
      form_fields: [],
      binary: null,
      headers: {},
      auth: { type: "None" },
      settings: {},
      ...requestOverrides,
      scripts: { pre_request: pre, post_response: post },
    },
    folder_id: folder.id,
    order,
    created_at: now,
    updated_at: now,
  });
};
const local = "http://localhost:8080";

add(folders.smoke, "smoke-get", 0, "01 - GET + JSON + test", `${local}/api/methods/get`, {
  post: json('pm.test("GET doğrulandı", () => pm.expect(payload.method).to.equal("GET"));'),
});
add(folders.smoke, "smoke-post", 1, "02 - POST + 201", `${local}/api/methods/post`, {
  method: "POST",
  post: json('pm.test("POST doğrulandı", () => pm.expect(payload.method).to.equal("POST"));', 201),
});
add(folders.smoke, "smoke-body", 2, "03 - JSON body", `${local}/api/body/json`, {
  method: "POST",
  body_type: "json",
  body: '{"name":"Dispatch","count":3,"enabled":true}',
  post: json('pm.test("JSON content döndü", () => { pm.expect(payload.valid).to.equal(true); pm.expect(payload.content.name).to.equal("Dispatch"); });'),
});
add(folders.smoke, "smoke-auth", 3, "04 - Bearer auth", `${local}/api/auth/bearer`, {
  auth: { type: "Bearer", token: "bearer-test-token" },
  post: json('pm.test("Bearer kabul edildi", () => pm.expect(payload.authenticated).to.equal(true));'),
});
add(folders.smoke, "smoke-script", 4, "05 - Pre-request mutation + tests", `${local}/api/echo?before=yes`, {
  pre: [
    'pm.request.headers.upsert({ key: "X-From-Script", value: "yes" });',
    'pm.request.url.query.upsert({ key: "before", value: "changed" });',
    'console.info("Smoke pre-request", { method: pm.request.method });',
  ].join("\n"),
  post: json([
    'pm.test("Query mutation uygulandı", () => pm.expect(payload.parameters.before[0]).to.equal("changed"));',
    'pm.test("Header mutation uygulandı", () => pm.expect(payload.headers["x-from-script"]).to.equal("yes"));',
    'console.info("Smoke post-response", { status: pm.response.code });',
  ].join("\n")),
});
add(folders.smoke, "smoke-cookie-set", 5, "06 - Cookie kaydet", `${local}/api/cookies/set?name=regression_smoke&value=works&path=%2F&maxAge=3600`, { settings: { cookie_credentials: "include" } });
add(folders.smoke, "smoke-cookie-show", 6, "07 - Cookie gönderimini doğrula", `${local}/api/cookies/show`, {
  settings: { cookie_credentials: "include" },
  post: json('pm.test("Cookie jar otomatik ekledi", () => pm.expect(payload.cookies.regression_smoke).to.equal("works"));'),
});

const methodCases = [
  ["get", "GET", "get", 200],
  ["post", "POST", "post", 201],
  ["put", "PUT", "put", 200],
  ["patch", "PATCH", "patch", 200],
  ["delete", "DELETE", "delete", 200],
];
methodCases.forEach(([key, method, path, code], order) => add(
  folders.methods,
  `method-${key}`,
  order,
  `${String(order + 1).padStart(2, "0")} - ${method}`,
  `${local}/api/methods/${path}`,
  { method, post: json(`pm.test("Method echo doğru", () => pm.expect(payload.method).to.equal("${method}"));`, code) },
));
add(folders.methods, "method-head", 5, "06 - HEAD boş body", `${local}/api/methods/head`, {
  method: "HEAD",
  post: [
    status(),
    'pm.test("HEAD response header var", () => pm.expect(pm.response.headers.get("x-method-test")).to.equal("HEAD request received"));',
    'pm.test("HEAD body boş", () => pm.expect(pm.response.text()).to.equal(""));',
  ].join("\n"),
});
add(folders.methods, "method-options", 6, "07 - OPTIONS Allow header", `${local}/api/methods/options`, {
  method: "OPTIONS",
  post: json([
    'pm.test("OPTIONS doğrulandı", () => pm.expect(payload.method).to.equal("OPTIONS"));',
    'pm.test("Allow header var", () => pm.expect(pm.response.headers.get("allow")).to.include("PATCH"));',
  ].join("\n")),
});
add(folders.methods, "query-headers", 7, "08 - Query, unicode, tekrar ve header", `${local}/api/echo?message=merhaba%20d%C3%BCnya&tag=one&tag=two&symbol=%E2%9C%93`, {
  headers: { "X-Dispatch-Test": "header-value", "X-Unicode": "Türkçe" },
  post: json([
    'pm.test("Unicode query çözüldü", () => pm.expect(payload.parameters.message[0]).to.equal("merhaba dünya"));',
    'pm.test("Tekrarlı query korundu", () => pm.expect(payload.parameters.tag).to.eql(["one", "two"]));',
    'pm.test("Özel header gönderildi", () => pm.expect(payload.headers["x-dispatch-test"]).to.equal("header-value"));',
  ].join("\n")),
});

add(folders.bodies, "body-json-object", 0, "01 - JSON object", `${local}/api/body/json`, {
  method: "POST",
  body_type: "json",
  body: '{"user":{"id":42},"roles":["admin","editor"]}',
  post: json([
    'pm.test("Nested JSON korundu", () => pm.expect(payload.content.user.id).to.equal(42));',
    'pm.test("Array korundu", () => pm.expect(payload.content.roles).to.eql(["admin", "editor"]));',
  ].join("\n")),
});
add(folders.bodies, "body-json-array", 1, "02 - JSON array", `${local}/api/body/json`, {
  method: "POST",
  body_type: "json",
  body: '[1,{"name":"two"},true]',
  post: json('pm.test("Root array kabul edildi", () => pm.expect(payload.content[1].name).to.equal("two"));'),
});
add(folders.bodies, "body-text", 2, "03 - Plain text + unicode", `${local}/api/body/text`, {
  method: "POST",
  body_type: "text",
  body: "Dispatch düz metin — Türkçe ✓",
  post: json('pm.test("Text aynen gönderildi", () => pm.expect(payload.content).to.include("Türkçe ✓"));'),
});
add(folders.bodies, "body-xml", 3, "04 - XML", `${local}/api/body/xml`, {
  method: "POST",
  body_type: "xml",
  body: '<?xml version="1.0"?><message><title>Dispatch</title></message>',
  post: json('pm.test("XML kabul edildi", () => pm.expect(payload.type).to.equal("xml"));'),
});
add(folders.bodies, "body-urlencoded", 4, "05 - x-www-form-urlencoded", `${local}/api/body/urlencoded`, {
  method: "POST",
  body_type: "x-www-form-urlencoded",
  form_fields: [{ key: "name", value: "Dispatch Web" }, { key: "active", value: "true" }],
  post: json('pm.test("Form alanları çözüldü", () => pm.expect(payload.fields.name).to.equal("Dispatch Web"));'),
});
add(folders.bodies, "body-multipart", 5, "06 - Multipart form-data", `${local}/api/body/multipart`, {
  method: "POST",
  body_type: "form-data",
  form_fields: [{ key: "title", value: "Upload test" }, { key: "category", value: "regression" }],
  post: json('pm.test("Multipart alan sayısı", () => pm.expect(payload.fieldCount).to.equal(2));'),
});
add(folders.bodies, "body-binary", 6, "07 - Binary upload", `${local}/api/body/binary`, {
  method: "POST",
  body_type: "binary",
  binary: { name: "dispatch.bin", mime_type: "application/octet-stream", data_base64: "RGlzcGF0Y2ggYmluYXJ5" },
  post: json([
    'pm.test("Binary boyutu doğru", () => pm.expect(payload.size).to.equal(15));',
    'pm.test("SHA-256 üretildi", () => pm.expect(payload.sha256.length).to.equal(64));',
  ].join("\n")),
});
add(folders.bodies, "body-invalid-json", 7, "08 - Beklenen 400: bozuk JSON", `${local}/api/body/json`, {
  method: "POST",
  body_type: "json",
  body: '{"broken":',
  post: status(400),
});

add(folders.auth, "auth-basic", 0, "01 - Basic başarılı", `${local}/api/auth/basic`, {
  auth: { type: "Basic", username: "mini", password: "postman" },
  post: json('pm.test("Basic auth başarılı", () => pm.expect(payload.scheme).to.equal("basic"));'),
});
add(folders.auth, "auth-bearer", 1, "02 - Bearer başarılı", `${local}/api/auth/bearer`, {
  auth: { type: "Bearer", token: "bearer-test-token" },
  post: json('pm.test("Bearer auth başarılı", () => pm.expect(payload.scheme).to.equal("bearer"));'),
});
add(folders.auth, "auth-api-header", 2, "03 - API key header", `${local}/api/auth/api-key`, {
  auth: { type: "ApiKey", key: "X-API-Key", value: "dispatch-api-key", add_to: "Header" },
  post: json('pm.test("Header API key başarılı", () => pm.expect(payload.authenticated).to.equal(true));'),
});
add(folders.auth, "auth-api-query", 3, "04 - API key query", `${local}/api/auth/api-key`, {
  auth: { type: "ApiKey", key: "api_key", value: "dispatch-api-key", add_to: "QueryParam" },
  post: json('pm.test("Query API key başarılı", () => pm.expect(payload.authenticated).to.equal(true));'),
});
add(folders.auth, "auth-oauth-client", 4, "05 - OAuth2 client credentials", `${local}/api/auth/oauth`, {
  auth: {
    type: "OAuth2",
    grant_type: "client_credentials",
    access_token_url: `${local}/oauth/token`,
    client_id: "dispatch-client",
    client_secret: "dispatch-secret",
    scope: "read write",
    username: "",
    password: "",
    access_token: "",
    client_authentication: "header",
  },
  post: json('pm.test("OAuth resource açıldı", () => pm.expect(payload.scheme).to.equal("oauth2"));'),
});
add(folders.auth, "auth-basic-fail", 5, "06 - Beklenen 401: yanlış Basic", `${local}/api/auth/basic`, {
  auth: { type: "Basic", username: "wrong", password: "wrong" },
  post: status(401),
});
add(folders.auth, "auth-bearer-fail", 6, "07 - Beklenen 401: yanlış Bearer", `${local}/api/auth/bearer`, {
  auth: { type: "Bearer", token: "wrong-token" },
  post: status(401),
});

const statusCases = [
  [201, "Created"],
  [204, "No Content"],
  [400, "Bad Request"],
  [401, "Unauthorized"],
  [404, "Not Found"],
  [418, "Teapot"],
  [500, "Server Error"],
];
statusCases.forEach(([code, label], order) => add(
  folders.response,
  `status-${code}`,
  order,
  `${String(order + 1).padStart(2, "0")} - ${code} ${label}`,
  `${local}/api/diagnostics/status/${code}`,
  { post: status(code) },
));
add(folders.response, "response-redirect-follow", 7, "08 - Redirect takip et", `${local}/api/diagnostics/redirect`, {
  settings: { follow_redirects: true },
  post: json('pm.test("Final hedefe ulaşıldı", () => pm.expect(payload.target).to.equal("final"));'),
});
add(folders.response, "response-redirect-stop", 8, "09 - Redirect takip etme", `${local}/api/diagnostics/redirect`, {
  settings: { follow_redirects: false },
  post: status(302),
});
add(folders.response, "response-chain", 9, "10 - Üçlü redirect zinciri", `${local}/api/diagnostics/redirect-chain?remaining=3`, {
  settings: { follow_redirects: true, max_redirects: 5 },
  post: json('pm.test("Redirect zinciri tamamlandı", () => pm.expect(payload.remaining).to.equal(0));'),
});
add(folders.response, "response-headers", 10, "11 - Custom response headers", `${local}/api/diagnostics/response/headers`, {
  post: [
    status(),
    'pm.test("Custom header okundu", () => pm.expect(pm.response.headers.get("x-dispatch-test")).to.equal("ready"));',
    'pm.test("Cache-Control okundu", () => pm.expect(pm.response.headers.get("cache-control")).to.include("no-store"));',
  ].join("\n"),
});
add(folders.response, "response-text", 11, "12 - Plain text response", `${local}/api/diagnostics/response/text`, {
  post: [status(), 'pm.test("Text body okundu", () => pm.expect(pm.response.text()).to.include("plain text"));'].join("\n"),
});
add(folders.response, "response-html", 12, "13 - HTML Preview", `${local}/api/diagnostics/response/html`, {
  post: [status(), 'pm.test("HTML body okundu", () => pm.expect(pm.response.text()).to.include("Dispatch preview"));'].join("\n"),
});
add(folders.response, "response-binary", 13, "14 - Binary response 1024 B", `${local}/api/diagnostics/response/binary?size=1024`, {
  post: [status(), 'pm.test("Binary content type", () => pm.expect(pm.response.headers.get("content-type")).to.include("application/octet-stream"));'].join("\n"),
});
add(folders.response, "response-empty", 14, "15 - Empty response", `${local}/api/diagnostics/response/empty`, {
  post: [status(204), 'pm.test("Body boş", () => pm.expect(pm.response.text()).to.equal(""));'].join("\n"),
});
add(folders.response, "response-malformed", 15, "16 - Malformed JSON görüntüleme", `${local}/api/diagnostics/response/malformed-json`);
add(folders.response, "response-delay", 16, "17 - 750 ms gecikme", `${local}/api/diagnostics/delay?ms=750`, {
  post: json([
    'pm.test("Delay cevabı geldi", () => pm.expect(payload.delayMs).to.equal(750));',
    'pm.test("Response time ölçüldü", () => pm.expect(pm.response.responseTime).to.be.at.least(700));',
  ].join("\n")),
});
add(folders.response, "response-http1", 17, "18 - HTTP/1 zorla (desktop)", `${local}/api/methods/get`, {
  settings: { http_version: "http1" },
});

add(folders.scripts, "script-mutation", 0, "01 - Request mutation", `${local}/api/echo?original=one`, {
  pre: [
    'pm.request.method = "POST";',
    'pm.request.url.query.upsert({ key: "original", value: "updated" });',
    'pm.request.url.query.add({ key: "script", value: "enabled" });',
    'pm.request.headers.upsert({ key: "X-Script", value: "pre-request" });',
    'console.log("Prepared", pm.request.method, pm.request.url.toString());',
  ].join("\n"),
  post: json([
    'pm.test("Method değişti", () => pm.expect(payload.method).to.equal("POST"));',
    'pm.test("Query değişti", () => pm.expect(payload.parameters.original[0]).to.equal("updated"));',
    'pm.test("Header eklendi", () => pm.expect(payload.headers["x-script"]).to.equal("pre-request"));',
  ].join("\n")),
});
add(folders.scripts, "script-console", 1, "02 - Console levels + structured object", `${local}/api/methods/get`, {
  pre: [
    'console.log("log message", 1, true);',
    'console.info("info object", { nested: { value: 42 }, list: [1, 2, 3] });',
    'console.warn("warning message");',
    'console.error("error message for diagnostics");',
  ].join("\n"),
  post: [status(), 'console.info("post-response", { status: pm.response.code, body: pm.response.json() });'].join("\n"),
});
add(folders.scripts, "script-clear", 2, "03 - console.clear davranışı", `${local}/api/methods/get`, {
  pre: [
    'console.log("Bu kayıt clear ile silinmeli");',
    'console.clear();',
    'console.log("Clear sonrasında kalan kayıt");',
  ].join("\n"),
  post: [status(), 'console.info("Network sonrasında post-response kaydı");'].join("\n"),
});
add(folders.scripts, "script-env", 3, "04 - Environment set/get/unset", `${local}/api/echo`, {
  pre: [
    'pm.environment.set("regression_token", "created-by-pre-request");',
    'pm.request.headers.upsert({ key: "X-Environment-Value", value: pm.environment.get("regression_token") });',
  ].join("\n"),
  post: json([
    'pm.test("Environment değeri requeste taşındı", () => pm.expect(payload.headers["x-environment-value"]).to.equal("created-by-pre-request"));',
    'pm.test("Environment değeri okunuyor", () => pm.expect(pm.environment.get("regression_token")).to.equal("created-by-pre-request"));',
    'pm.environment.unset("regression_token");',
  ].join("\n")),
});
add(folders.scripts, "script-alias", 4, "05 - pm ve dp alias birlikte", `${local}/api/echo`, {
  pre: [
    'dp.request.headers.set("X-DP-Alias", "works");',
    'pm.request.headers.set("X-PM-Alias", "works");',
  ].join("\n"),
  post: json([
    'dp.test("dp alias", () => dp.expect(payload.headers["x-dp-alias"]).to.equal("works"));',
    'pm.test("pm alias", () => pm.expect(payload.headers["x-pm-alias"]).to.equal("works"));',
  ].join("\n")),
});
add(folders.scripts, "script-assertions", 5, "06 - Assertion zincirleri", `${local}/api/diagnostics/response/headers`, {
  post: json([
    'pm.test("Chai zincirleri", () => {',
    '  pm.expect(payload).to.have.property("headers", true);',
    '  pm.expect(["ready", "done"]).to.include("ready");',
    '  pm.expect(pm.response).to.have.status(200);',
    '  pm.expect(pm.response).to.be.ok;',
    '});',
  ].join("\n")),
});
add(folders.scripts, "script-redaction", 6, "07 - Console sensitive value masking", `${local}/api/echo`, {
  headers: { Authorization: "Bearer console-secret-token", "X-API-Key": "console-api-key-secret" },
  pre: [
    'console.log("Authorization", pm.request.headers.get("Authorization"));',
    'console.log({ token: "console-secret-token", password: "never-show-this" });',
  ].join("\n"),
  post: [status(), 'console.info("Console secret değerleri redacted görünmeli");'].join("\n"),
});

add(folders.cookies, "cookie-clean", 0, "01 - Regression cookie temizle", `${local}/api/cookies/delete?name=regression_quick&path=%2F`, {
  method: "DELETE",
  settings: { cookie_credentials: "include" },
});
add(folders.cookies, "cookie-set", 1, "02 - Set-Cookie kaydet", `${local}/api/cookies/set?name=regression_quick&value=stored&path=%2F&maxAge=3600&httpOnly=true&secure=false&sameSite=Lax`, {
  settings: { cookie_credentials: "include" },
});
add(folders.cookies, "cookie-show", 2, "03 - Cookie otomatik gönder", `${local}/api/cookies/show`, {
  settings: { cookie_credentials: "include" },
  post: json('pm.test("Cookie gönderildi", () => pm.expect(payload.cookies.regression_quick).to.equal("stored"));'),
});
add(folders.cookies, "cookie-delete", 3, "04 - Cookie sil", `${local}/api/cookies/delete?name=regression_quick&path=%2F`, {
  method: "DELETE",
  settings: { cookie_credentials: "include" },
});
add(folders.cookies, "cookie-verify-delete", 4, "05 - Cookie silinmesini doğrula", `${local}/api/cookies/show`, {
  settings: { cookie_credentials: "include" },
  post: json('pm.test("Cookie artık gönderilmiyor", () => pm.expect(JSON.stringify(payload.cookies)).to.not.include("regression_quick"));'),
});

add(folders.runner, "runner-seed", 0, "01 - RUNNER: environment state oluştur", `${local}/api/echo`, {
  pre: [
    'pm.environment.set("runner_chain_value", "from-first-request");',
    'console.info("Runner state created", pm.info.iteration, pm.info.iterationCount);',
  ].join("\n"),
});
add(folders.runner, "runner-use", 1, "02 - RUNNER: state sonraki requestte", `${local}/api/echo?chain={{runner_chain_value}}`, {
  post: json([
    'pm.test("Runner environment state taşındı", () => pm.expect(payload.parameters.chain[0]).to.equal("from-first-request"));',
    'pm.test("Iteration metadata var", () => pm.expect(pm.info.iterationCount).to.be.at.least(1));',
  ].join("\n")),
});
add(folders.runner, "runner-clean", 2, "03 - RUNNER: state temizle", `${local}/api/methods/get`, {
  post: [status(), 'pm.environment.unset("runner_chain_value");'].join("\n"),
});

add(folders.expected, "error-assertion", 0, "01 - BEKLENEN HATA: failed assertion", `${local}/api/methods/get`, {
  post: 'pm.test("Bu assertion bilinçli olarak fail", () => pm.expect(pm.response.code).to.equal(999));',
});
add(folders.expected, "error-pre-runtime", 1, "02 - BEKLENEN HATA: pre-request runtime", `${local}/api/methods/get`, {
  pre: ['console.log("Runtime error öncesi kayıt korunmalı");', 'throw new Error("intentional pre-request runtime error");'].join("\n"),
  post: "",
});
add(folders.expected, "error-post-runtime", 2, "03 - BEKLENEN HATA: post-response runtime", `${local}/api/methods/get`, {
  post: ['console.log("Response alındı, şimdi hata üretilecek");', 'throw new Error("intentional post-response runtime error");'].join("\n"),
});
add(folders.expected, "error-syntax", 3, "04 - BEKLENEN HATA: syntax error", `${local}/api/methods/get`, { pre: "const broken = ;", post: "" });
add(folders.expected, "error-timeout", 4, "05 - BEKLENEN HATA: script timeout", `${local}/api/methods/get`, { pre: "while (true) {}", post: "" });
add(folders.expected, "error-unsupported", 5, "06 - BEKLENEN HATA: unsupported pm.sendRequest", `${local}/api/methods/get`, { pre: `pm.sendRequest("${local}/api/methods/get");`, post: "" });
add(folders.expected, "error-unresolved", 6, "07 - BEKLENEN HATA: unresolved variable", `${local}/api/echo?missing={{definitely_missing_variable}}`, { post: "" });
add(folders.expected, "error-network", 7, "08 - BEKLENEN HATA: connection refused", "http://127.0.0.1:1/unreachable", { post: "" });
add(folders.expected, "error-redirect-limit", 8, "09 - BEKLENEN HATA: redirect limiti", `${local}/api/diagnostics/redirect-chain?remaining=5`, {
  settings: { follow_redirects: true, max_redirects: 2 },
  post: "",
});
add(folders.expected, "error-http2", 9, "10 - DESKTOP BEKLENEN HATA: local HTTP/2", `${local}/api/methods/get`, {
  settings: { http_version: "http2" },
  post: "",
});
add(folders.expected, "manual-large", 10, "11 - MANUEL: global response limiti 1 MB", `${local}/api/diagnostics/response/large?bytes=2000000`, { post: "" });
add(folders.expected, "manual-timeout", 11, "12 - MANUEL: global timeout 250 ms", `${local}/api/diagnostics/delay?ms=1500`, { post: "" });

const oldFolders = collection.folders ?? [];
const replacedIds = new Set(oldFolders.filter((item) => item.id === rootId || item.parent_folder_id === rootId).map((item) => item.id));
collection.folders = [...oldFolders.filter((item) => !replacedIds.has(item.id)), root, ...Object.values(folders)];
collection.requests = [...(collection.requests ?? []).filter((item) => !replacedIds.has(item.folder_id)), ...specs];
collection.updated_at = now;
document.updated_at = now;
document.revision = (document.revision ?? 0) + 1;
const backup = `${file}.before-full-regression`;
copyFileSync(file, backup);
writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
console.log(`Added ${Object.keys(folders).length} folders and ${specs.length} requests under ${root.name}`);
console.log(`Backup: ${backup}`);
