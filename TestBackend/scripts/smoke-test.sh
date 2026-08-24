#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8080}"
PASSED=0

assert_json() {
  local name="$1"
  local json="$2"
  local expression="$3"
  if jq -e "$expression" >/dev/null <<<"$json"; then
    printf 'PASS %s\n' "$name"
    PASSED=$((PASSED + 1))
  else
    printf 'FAIL %s\nResponse: %s\n' "$name" "$json" >&2
    exit 1
  fi
}

assert_status() {
  local name="$1"
  local actual="$2"
  local expected="$3"
  if [ "$actual" = "$expected" ]; then
    printf 'PASS %s\n' "$name"
    PASSED=$((PASSED + 1))
  else
    printf 'FAIL %s (expected HTTP %s, got HTTP %s)\n' "$name" "$expected" "$actual" >&2
    exit 1
  fi
}

for method in get post put patch delete; do
  upper_method=$(printf '%s' "$method" | tr '[:lower:]' '[:upper:]')
  response=$(curl --silent --show-error --request "$upper_method" "$BASE_URL/api/methods/$method")
  assert_json "HTTP $upper_method" "$response" ".success == true and .method == \"$upper_method\""
done

head_headers=$(curl --silent --show-error --head "$BASE_URL/api/methods/head")
head_status=$(printf '%s\n' "$head_headers" | sed -n '1s/.* \([0-9][0-9][0-9]\).*/\1/p')
assert_status "HTTP HEAD" "$head_status" "200"
if printf '%s\n' "$head_headers" | tr -d '\r' | grep -qi '^X-Method-Test: HEAD request received$'; then
  printf 'PASS HEAD response header\n'
  PASSED=$((PASSED + 1))
else
  printf 'FAIL HEAD response header\nHeaders: %s\n' "$head_headers" >&2
  exit 1
fi

response=$(curl --silent --show-error --request OPTIONS "$BASE_URL/api/methods/options")
assert_json "HTTP OPTIONS" "$response" '.success == true and .method == "OPTIONS"'

response=$(curl --silent --show-error --request POST --header 'Content-Type: application/json' \
  --data '{"name":"Dispatch","nested":{"ok":true}}' "$BASE_URL/api/body/json")
assert_json "JSON body" "$response" '.valid == true and .content.nested.ok == true'

response=$(curl --silent --show-error --request POST --form 'title=Dispatch' --form 'kind=e2e' \
  "$BASE_URL/api/body/multipart")
assert_json "multipart body" "$response" '.valid == true and .fieldCount == 2 and .fields.title == "Dispatch"'

response=$(printf '\x01\x02\x03\x04' | curl --silent --show-error --request POST \
  --header 'Content-Type: application/octet-stream' --data-binary @- "$BASE_URL/api/body/binary")
assert_json "binary body" "$response" '.valid == true and .size == 4'

response=$(curl --silent --show-error --request POST --header 'Content-Type: text/plain' \
  --data 'plain Dispatch text' "$BASE_URL/api/body/text")
assert_json "text body" "$response" '.valid == true and .content == "plain Dispatch text"'

response=$(curl --silent --show-error --request POST --header 'Content-Type: application/xml' \
  --data '<request><ok>true</ok></request>' "$BASE_URL/api/body/xml")
assert_json "XML body" "$response" '.valid == true and .type == "xml"'

response=$(curl --silent --show-error --request POST --header 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'name=Dispatch' --data-urlencode 'mode=e2e' "$BASE_URL/api/body/urlencoded")
assert_json "urlencoded body" "$response" '.valid == true and .fields.name == "Dispatch"'

response=$(curl --silent --show-error --header 'X-E2E-Header: works' \
  "$BASE_URL/api/echo?name=Mini%20Postman&tag=one&tag=two")
assert_json "query and header echo" "$response" \
  '.parameters.name[0] == "Dispatch" and .parameters.tag == ["one", "two"] and .headers["x-e2e-header"] == "works"'

response=$(curl --silent --show-error --user 'mini:postman' "$BASE_URL/api/auth/basic")
assert_json "Basic Auth" "$response" '.authenticated == true and .scheme == "basic"'

response=$(curl --silent --show-error --header 'Authorization: Bearer bearer-test-token' \
  "$BASE_URL/api/auth/bearer")
assert_json "Bearer Token" "$response" '.authenticated == true and .scheme == "bearer"'

response=$(curl --silent --show-error --header 'X-API-Key: dispatch-api-key' "$BASE_URL/api/auth/api-key")
assert_json "API Key header" "$response" '.authenticated == true and .scheme == "api-key"'

response=$(curl --silent --show-error "$BASE_URL/api/auth/api-key?api_key=dispatch-api-key")
assert_json "API Key query" "$response" '.authenticated == true and .scheme == "api-key"'

status=$(curl --silent --output /dev/null --write-out '%{http_code}' --user 'mini:wrong' "$BASE_URL/api/auth/basic")
assert_status "Basic Auth rejects bad password" "$status" "401"

status=$(curl --silent --output /dev/null --write-out '%{http_code}' --header 'Authorization: Bearer wrong' \
  "$BASE_URL/api/auth/bearer")
assert_status "Bearer rejects bad token" "$status" "401"

status=$(curl --silent --output /dev/null --write-out '%{http_code}' "$BASE_URL/api/auth/api-key")
assert_status "API Key rejects missing key" "$status" "401"

status=$(curl --silent --output /dev/null --write-out '%{http_code}' --user 'wrong:client' \
  --data 'grant_type=client_credentials' "$BASE_URL/oauth/token")
assert_status "OAuth rejects bad client" "$status" "401"

client_token=$(curl --silent --show-error --user 'dispatch-client:dispatch-secret' \
  --data 'grant_type=client_credentials&scope=read%20write' "$BASE_URL/oauth/token" | jq -r '.access_token')
response=$(curl --silent --show-error --header "Authorization: Bearer $client_token" "$BASE_URL/api/auth/oauth")
assert_json "OAuth client_credentials" "$response" '.authenticated == true and .scheme == "oauth2"'

password_token=$(curl --silent --show-error --data 'grant_type=password' \
  --data 'client_id=dispatch-client' --data 'client_secret=dispatch-secret' \
  --data 'username=testuser' --data 'password=testpass' "$BASE_URL/oauth/token" | jq -r '.access_token')
response=$(curl --silent --show-error --header "Authorization: Bearer $password_token" "$BASE_URL/api/auth/oauth")
assert_json "OAuth password" "$response" '.authenticated == true and .scheme == "oauth2"'

code_verifier='0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-._~'
code_challenge=$(printf '%s' "$code_verifier" | openssl dgst -binary -sha256 | openssl base64 -A | tr '+/' '-_' | tr -d '=')
authorize_headers=$(curl --silent --show-error --dump-header - --output /dev/null \
  --get "$BASE_URL/oauth/authorize" \
  --data-urlencode 'response_type=code' \
  --data-urlencode 'client_id=dispatch-client' \
  --data-urlencode 'redirect_uri=http://127.0.0.1:8765/callback' \
  --data-urlencode 'state=e2e' \
  --data-urlencode "code_challenge=$code_challenge" \
  --data-urlencode 'code_challenge_method=S256')
location=$(printf '%s\n' "$authorize_headers" | sed -n 's/^[Ll]ocation: //p' | tr -d '\r')
code=$(printf '%s\n' "$location" | sed -n 's/.*[?&]code=\([^&]*\).*/\1/p')
authorization_code_token=$(curl --silent --show-error --user 'dispatch-client:dispatch-secret' \
  --data 'grant_type=authorization_code' --data-urlencode "code=$code" \
  --data-urlencode 'redirect_uri=http://127.0.0.1:8765/callback' \
  --data-urlencode "code_verifier=$code_verifier" "$BASE_URL/oauth/token" | jq -r '.access_token')
response=$(curl --silent --show-error --header "Authorization: Bearer $authorization_code_token" \
  "$BASE_URL/api/auth/oauth")
assert_json "OAuth authorization_code" "$response" '.authenticated == true and .scheme == "oauth2"'

printf 'All %d backend smoke checks passed.\n' "$PASSED"
