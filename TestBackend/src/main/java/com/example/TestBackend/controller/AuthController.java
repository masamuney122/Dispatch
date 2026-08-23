package com.example.TestBackend.controller;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;

import com.example.TestBackend.auth.MockTokenService;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.util.UriComponentsBuilder;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AuthController {

    public static final String CLIENT_ID = "minipostman-client";
    public static final String CLIENT_SECRET = "minipostman-secret";
    public static final String RESOURCE_USERNAME = "testuser";
    public static final String RESOURCE_PASSWORD = "testpass";

    private final MockTokenService tokenService;

    public AuthController(MockTokenService tokenService) {
        this.tokenService = tokenService;
    }

    @GetMapping("/oauth/authorize")
    public ResponseEntity<Void> authorize(
            @RequestParam(name = "response_type", defaultValue = "") String responseType,
            @RequestParam(name = "client_id", defaultValue = "") String clientId,
            @RequestParam(name = "redirect_uri", defaultValue = "") String redirectUri,
            @RequestParam(name = "state", defaultValue = "") String state,
            @RequestParam(name = "code_challenge", defaultValue = "") String codeChallenge,
            @RequestParam(name = "code_challenge_method", defaultValue = "") String codeChallengeMethod) {
        if (!"code".equals(responseType)
                || !CLIENT_ID.equals(clientId)
                || !isLoopbackRedirect(redirectUri)
                || !StringUtils.hasText(state)
                || !StringUtils.hasText(codeChallenge)
                || !"S256".equals(codeChallengeMethod)) {
            return ResponseEntity.badRequest().build();
        }

        String code = tokenService.issueAuthorizationCode(clientId, redirectUri, codeChallenge);
        String callback = UriComponentsBuilder.fromUriString(redirectUri)
                .queryParam("code", code)
                .queryParam("state", state)
                .build()
                .encode()
                .toUriString();
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.LOCATION, callback)
                .build();
    }

    @PostMapping("/oauth/token")
    public ResponseEntity<Map<String, Object>> token(
            HttpServletRequest request,
            @RequestParam(name = "grant_type", defaultValue = "") String grantType,
            @RequestParam(name = "client_id", defaultValue = "") String bodyClientId,
            @RequestParam(name = "client_secret", defaultValue = "") String bodyClientSecret,
            @RequestParam(name = "username", defaultValue = "") String username,
            @RequestParam(name = "password", defaultValue = "") String password,
            @RequestParam(name = "code", defaultValue = "") String code,
            @RequestParam(name = "redirect_uri", defaultValue = "") String redirectUri,
            @RequestParam(name = "code_verifier", defaultValue = "") String codeVerifier,
            @RequestParam(name = "scope", defaultValue = "") String scope) {
        String[] client = readClientCredentials(request.getHeader(HttpHeaders.AUTHORIZATION), bodyClientId,
                bodyClientSecret);
        if (!CLIENT_ID.equals(client[0]) || !CLIENT_SECRET.equals(client[1])) {
            return oauthError(HttpStatus.UNAUTHORIZED, "invalid_client", "Client credentials are invalid");
        }

        boolean validGrant = switch (grantType) {
            case "client_credentials" -> true;
            case "password" -> RESOURCE_USERNAME.equals(username) && RESOURCE_PASSWORD.equals(password);
            case "authorization_code" -> tokenService.consumeAuthorizationCode(
                    code,
                    client[0],
                    redirectUri,
                    codeVerifier);
            default -> false;
        };
        if (!validGrant) {
            return oauthError(HttpStatus.BAD_REQUEST, "invalid_grant", "Grant data is missing or invalid");
        }

        return ResponseEntity.ok(Map.of(
                "access_token", tokenService.issueToken(grantType),
                "token_type", "Bearer",
                "expires_in", 3600,
                "scope", scope));
    }

    @RequestMapping("/api/auth/basic")
    public Map<String, Object> basic() {
        return authSuccess("basic");
    }

    @RequestMapping("/api/auth/bearer")
    public Map<String, Object> bearer() {
        return authSuccess("bearer");
    }

    @RequestMapping("/api/auth/api-key")
    public Map<String, Object> apiKey() {
        return authSuccess("api-key");
    }

    @RequestMapping("/api/auth/oauth")
    public Map<String, Object> oauth() {
        return authSuccess("oauth2");
    }

    private String[] readClientCredentials(String authorization, String bodyClientId, String bodyClientSecret) {
        if (authorization != null && authorization.startsWith("Basic ")) {
            try {
                String decoded = new String(Base64.getDecoder().decode(authorization.substring(6)), StandardCharsets.UTF_8);
                int separator = decoded.indexOf(':');
                if (separator >= 0) {
                    return new String[] { decoded.substring(0, separator), decoded.substring(separator + 1) };
                }
            } catch (IllegalArgumentException ignored) {
                // Invalid Basic header is handled as invalid_client below.
            }
        }
        return new String[] { bodyClientId, bodyClientSecret };
    }

    private boolean isLoopbackRedirect(String redirectUri) {
        try {
            java.net.URI uri = java.net.URI.create(redirectUri);
            String host = uri.getHost();
            return "http".equals(uri.getScheme())
                    && uri.getPort() > 0
                    && ("127.0.0.1".equals(host) || "localhost".equalsIgnoreCase(host) || "::1".equals(host));
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private Map<String, Object> authSuccess(String scheme) {
        return Map.of("authenticated", true, "scheme", scheme);
    }

    private ResponseEntity<Map<String, Object>> oauthError(HttpStatus status, String error, String description) {
        return ResponseEntity.status(status).body(Map.of("error", error, "error_description", description));
    }
}
