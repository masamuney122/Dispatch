package com.example.TestBackend.controller;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/diagnostics")
public class DiagnosticsController {

    @GetMapping("/status/{code}")
    public ResponseEntity<Map<String, Object>> status(@PathVariable int code) {
        if (code < 100 || code > 599) {
            throw new IllegalArgumentException("Status code must be between 100 and 599");
        }
        return ResponseEntity.status(code).body(Map.of("status", code, "expected", true));
    }

    @GetMapping("/delay")
    public Map<String, Object> delay(@RequestParam(defaultValue = "250") long ms)
            throws InterruptedException {
        if (ms < 0 || ms > 10_000) {
            throw new IllegalArgumentException("Delay must be between 0 and 10000 ms");
        }
        Thread.sleep(ms);
        return Map.of("delayed", true, "delayMs", ms);
    }

    @GetMapping("/redirect")
    public ResponseEntity<Void> redirect(
            @RequestParam(defaultValue = "/api/diagnostics/final") String target) {
        if (!target.startsWith("/") || target.startsWith("//")) {
            throw new IllegalArgumentException("Redirect target must be a local absolute path");
        }
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.LOCATION, target)
                .build();
    }

    @GetMapping("/redirect-chain")
    public ResponseEntity<?> redirectChain(@RequestParam(defaultValue = "2") int remaining) {
        if (remaining < 0 || remaining > 10) {
            throw new IllegalArgumentException("Remaining redirects must be between 0 and 10");
        }
        if (remaining == 0) {
            return ResponseEntity.ok(Map.of("redirected", true, "remaining", 0));
        }
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.LOCATION, "/api/diagnostics/redirect-chain?remaining=" + (remaining - 1))
                .build();
    }

    @GetMapping("/final")
    public Map<String, Object> finalTarget() {
        return Map.of("redirected", true, "target", "final");
    }

    @GetMapping("/response/headers")
    public ResponseEntity<Map<String, Object>> responseHeaders() {
        return ResponseEntity.ok()
                .header("X-Dispatch-Test", "ready")
                .header("X-Dispatch-Multi", "one", "two")
                .cacheControl(CacheControl.noStore())
                .body(Map.of("headers", true));
    }

    @GetMapping(value = "/response/text", produces = MediaType.TEXT_PLAIN_VALUE)
    public String text() {
        return "Dispatch plain text response";
    }

    @GetMapping(value = "/response/html", produces = MediaType.TEXT_HTML_VALUE)
    public String html() {
        return "<!doctype html><html><body><h1>Dispatch preview</h1></body></html>";
    }

    @GetMapping(value = "/response/binary", produces = MediaType.APPLICATION_OCTET_STREAM_VALUE)
    public byte[] binary(@RequestParam(defaultValue = "256") int size) {
        if (size < 0 || size > 2_000_000) {
            throw new IllegalArgumentException("Binary size must be between 0 and 2000000 bytes");
        }
        byte[] bytes = new byte[size];
        for (int index = 0; index < size; index++) bytes[index] = (byte) (index % 251);
        return bytes;
    }

    @GetMapping("/response/empty")
    public ResponseEntity<Void> empty() {
        return ResponseEntity.noContent().build();
    }

    @GetMapping(value = "/response/malformed-json", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<byte[]> malformedJson() {
        return ResponseEntity.ok("{not-valid-json".getBytes(StandardCharsets.UTF_8));
    }

    @GetMapping(value = "/response/large", produces = MediaType.TEXT_PLAIN_VALUE)
    public byte[] large(@RequestParam(defaultValue = "1048576") int bytes) {
        if (bytes < 0 || bytes > 5_000_000) {
            throw new IllegalArgumentException("Response size must be between 0 and 5000000 bytes");
        }
        byte[] value = new byte[bytes];
        java.util.Arrays.fill(value, (byte) 'x');
        return value;
    }
}
