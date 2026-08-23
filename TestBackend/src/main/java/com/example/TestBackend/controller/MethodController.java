package com.example.TestBackend.controller;

import java.util.Map;

import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/methods")
public class MethodController {

    @GetMapping("/get")
    public Map<String, Object> get() {
        return success("GET");
    }

    @PostMapping("/post")
    public ResponseEntity<Map<String, Object>> post() {
        return ResponseEntity.status(201).body(success("POST"));
    }

    @PutMapping("/put")
    public Map<String, Object> put() {
        return success("PUT");
    }

    @PatchMapping("/patch")
    public Map<String, Object> patch() {
        return success("PATCH");
    }

    @DeleteMapping("/delete")
    public Map<String, Object> delete() {
        return success("DELETE");
    }

    @RequestMapping(path = "/head", method = RequestMethod.HEAD)
    public ResponseEntity<Void> head() {
        return ResponseEntity.ok()
                .header("X-Method-Test", "HEAD request received")
                .build();
    }

    @RequestMapping(path = "/options", method = RequestMethod.OPTIONS)
    public ResponseEntity<Map<String, Object>> options() {
        return ResponseEntity.ok()
                .header(HttpHeaders.ALLOW, "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS")
                .body(success("OPTIONS"));
    }

    private Map<String, Object> success(String method) {
        return Map.of("success", true, "method", method, "message", method + " request received");
    }
}
