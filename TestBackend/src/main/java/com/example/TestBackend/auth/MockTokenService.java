package com.example.TestBackend.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

@Service
public class MockTokenService {

    private final Map<String, Instant> tokens = new ConcurrentHashMap<>();
    private final Map<String, AuthorizationGrant> authorizationCodes = new ConcurrentHashMap<>();

    public String issueToken(String grantType) {
        String token = "mock-" + grantType.replace('_', '-') + "-" + UUID.randomUUID();
        tokens.put(token, Instant.now().plusSeconds(3600));
        return token;
    }

    public boolean isValidToken(String token) {
        Instant expiresAt = tokens.get(token);
        return expiresAt != null && expiresAt.isAfter(Instant.now());
    }

    public String issueAuthorizationCode(String clientId, String redirectUri, String codeChallenge) {
        String code = "mock-code-" + UUID.randomUUID();
        authorizationCodes.put(code, new AuthorizationGrant(
                clientId,
                redirectUri,
                codeChallenge,
                Instant.now().plusSeconds(300)));
        return code;
    }

    public boolean consumeAuthorizationCode(
            String code,
            String clientId,
            String redirectUri,
            String codeVerifier) {
        AuthorizationGrant grant = authorizationCodes.remove(code);
        if (grant == null
                || !grant.expiresAt().isAfter(Instant.now())
                || !grant.clientId().equals(clientId)
                || !grant.redirectUri().equals(redirectUri)) {
            return false;
        }
        return grant.codeChallenge().equals(pkceChallenge(codeVerifier));
    }

    private String pkceChallenge(String verifier) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(verifier.getBytes(StandardCharsets.US_ASCII));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 must be available", exception);
        }
    }

    private record AuthorizationGrant(
            String clientId,
            String redirectUri,
            String codeChallenge,
            Instant expiresAt) {
    }
}
