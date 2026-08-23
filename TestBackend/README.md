# MiniPostman Test Backend

Spring Boot target server used by MiniPostman's automated and manual E2E tests.

## Run and verify

```bash
./mvnw spring-boot:run
./scripts/smoke-test.sh
```

The server listens on `http://127.0.0.1:8080`.

## Endpoints

| Area | Endpoint | Expected input |
|---|---|---|
| HTTP methods | `GET /api/methods/get` | none |
|  | `POST /api/methods/post` | none |
|  | `PUT /api/methods/put` | none |
|  | `PATCH /api/methods/patch` | none |
|  | `DELETE /api/methods/delete` | none |
|  | `HEAD /api/methods/head` | `X-Method-Test` response header |
|  | `OPTIONS /api/methods/options` | JSON method confirmation and `Allow` header |
| Request bodies | `POST /api/body/json` | JSON object or array |
|  | `POST /api/body/multipart` | one or more multipart text fields |
|  | `POST /api/body/binary` | non-empty `application/octet-stream` body |
|  | `POST /api/body/text` | `text/plain` body |
|  | `POST /api/body/xml` | `application/xml` body |
|  | `POST /api/body/urlencoded` | URL-encoded form fields |
| Echo | `/api/echo` | any method, query parameters and headers |
| Basic Auth | `/api/auth/basic` | `mini` / `postman` |
| Bearer | `/api/auth/bearer` | `bearer-test-token` |
| API Key | `/api/auth/api-key` | `X-API-Key: minipostman-api-key` or `api_key=minipostman-api-key` |
| OAuth authorize | `GET /oauth/authorize` | `response_type=code`, client ID, loopback redirect URI, state and PKCE S256 challenge |
| OAuth token | `POST /oauth/token` | URL-encoded OAuth token request |
| OAuth resource | `/api/auth/oauth` | token issued by `/oauth/token` |

OAuth client credentials are `minipostman-client` / `minipostman-secret`.
The Password grant resource-owner credentials are `testuser` / `testpass`.
Authorization codes are single-use and expire after five minutes; access tokens expire after one hour.
The authorization endpoint auto-approves the mock client and redirects to the supplied loopback callback.
