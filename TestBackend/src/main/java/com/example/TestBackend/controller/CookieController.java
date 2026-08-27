package com.example.TestBackend.controller;

import java.time.Duration;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/cookies")
public class CookieController {

    @GetMapping("/set")
    public ResponseEntity<Map<String, Object>> setCookie(
            @RequestParam(defaultValue = "dispatch_session") String name,
            @RequestParam(defaultValue = "cookie-jar-works") String value,
            @RequestParam(defaultValue = "/") String path,
            @RequestParam(defaultValue = "3600") long maxAge,
            @RequestParam(defaultValue = "false") boolean secure,
            @RequestParam(defaultValue = "true") boolean httpOnly,
            @RequestParam(defaultValue = "Lax") String sameSite,
            @RequestParam(defaultValue = "") String domain) {
        ResponseCookie cookie = buildCookie(name, value, path, maxAge, secure, httpOnly, sameSite, domain);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(Map.of(
                        "stored", true,
                        "message", "Send the Show cookies request next; Dispatch should attach this cookie automatically.",
                        "setCookie", cookie.toString()));
    }

    @GetMapping({ "/show", "/scoped/show" })
    public Map<String, Object> showCookies(HttpServletRequest request) {
        Map<String, String> cookies = request.getCookies() == null
                ? Map.of()
                : Arrays.stream(request.getCookies()).collect(Collectors.toMap(
                        Cookie::getName,
                        Cookie::getValue,
                        (first, second) -> second,
                        LinkedHashMap::new));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("received", !cookies.isEmpty());
        result.put("count", cookies.size());
        result.put("cookies", cookies);
        result.put("rawCookieHeader", request.getHeader(HttpHeaders.COOKIE));
        result.put("path", request.getRequestURI());
        return result;
    }

    @GetMapping("/redirect")
    public ResponseEntity<Void> redirectWithCookie(
            @RequestParam(defaultValue = "redirect_session") String name,
            @RequestParam(defaultValue = "saved-during-redirect") String value) {
        ResponseCookie cookie = buildCookie(name, value, "/", 3600, false, true, "Lax", "");
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .header(HttpHeaders.LOCATION, "/api/cookies/redirect-target")
                .build();
    }

    @GetMapping("/redirect-target")
    public Map<String, Object> redirectTarget(HttpServletRequest request) {
        Map<String, Object> result = new LinkedHashMap<>(showCookies(request));
        result.put("redirectFollowed", true);
        result.put("expectedCookie", "redirect_session");
        return result;
    }

    @DeleteMapping("/delete")
    public ResponseEntity<Map<String, Object>> deleteCookie(
            @RequestParam(defaultValue = "dispatch_session") String name,
            @RequestParam(defaultValue = "/") String path) {
        ResponseCookie cookie = buildCookie(name, "", path, 0, false, true, "Lax", "");
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(Map.of("deleted", true, "name", name, "path", path));
    }

    @DeleteMapping("/clear-test-cookies")
    public ResponseEntity<Map<String, Object>> clearTestCookies() {
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE,
                        buildCookie("dispatch_session", "", "/", 0, false, true, "Lax", "").toString(),
                        buildCookie("redirect_session", "", "/", 0, false, true, "Lax", "").toString(),
                        buildCookie("scoped_cookie", "", "/api/cookies/scoped", 0, false, true, "Lax", "").toString())
                .body(Map.of(
                        "cleared", true,
                        "cookies", List.of("dispatch_session", "redirect_session", "scoped_cookie")));
    }

    private ResponseCookie buildCookie(
            String name,
            String value,
            String path,
            long maxAge,
            boolean secure,
            boolean httpOnly,
            String sameSite,
            String domain) {
        if (!StringUtils.hasText(name)) {
            throw new IllegalArgumentException("Cookie name must not be empty");
        }
        if (!path.startsWith("/")) {
            throw new IllegalArgumentException("Cookie path must start with /");
        }
        if (!sameSite.equalsIgnoreCase("Lax")
                && !sameSite.equalsIgnoreCase("Strict")
                && !sameSite.equalsIgnoreCase("Nones")) {
            throw new IllegalArgumentException("SameSite must be Lax, Strict, or None");
        }

        ResponseCookie.ResponseCookieBuilder builder = ResponseCookie.from(name, value)
                .path(path)
                .secure(secure)
                .httpOnly(httpOnly)
                .sameSite(sameSite);
        if (maxAge >= 0) builder.maxAge(Duration.ofSeconds(maxAge));
        if (StringUtils.hasText(domain)) builder.domain(domain);
        return builder.build();
    }
}
