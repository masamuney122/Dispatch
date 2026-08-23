package com.example.TestBackend.controller;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;

import tools.jackson.databind.JsonNode;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/body")
public class BodyController {

    @PostMapping(path = "/json", consumes = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> json(@RequestBody JsonNode body) {
        if (body.isNull() || (!body.isObject() && !body.isArray())) {
            throw new IllegalArgumentException("JSON body must be an object or array");
        }
        return Map.of("valid", true, "type", "json", "content", body);
    }

    @PostMapping(path = "/multipart", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> multipart(@RequestParam Map<String, String> fields) {
        if (fields.isEmpty()) {
            throw new IllegalArgumentException("At least one multipart field is required");
        }
        return Map.of("valid", true, "type", "multipart", "fieldCount", fields.size(), "fields", fields);
    }

    @PostMapping(path = "/binary", consumes = MediaType.APPLICATION_OCTET_STREAM_VALUE)
    public Map<String, Object> binary(@RequestBody byte[] body) throws NoSuchAlgorithmException {
        if (body.length == 0) {
            throw new IllegalArgumentException("Binary body must not be empty");
        }
        String sha256 = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body));
        return Map.of("valid", true, "type", "binary", "size", body.length, "sha256", sha256);
    }

    @PostMapping(path = "/text", consumes = MediaType.TEXT_PLAIN_VALUE)
    public Map<String, Object> text(@RequestBody String body) {
        return Map.of("valid", !body.isEmpty(), "type", "text", "length", body.length(), "content", body);
    }

    @PostMapping(path = "/xml", consumes = { MediaType.APPLICATION_XML_VALUE, MediaType.TEXT_XML_VALUE })
    public Map<String, Object> xml(@RequestBody String body) {
        String normalized = body.trim();
        boolean looksLikeXml = normalized.startsWith("<") && normalized.endsWith(">");
        if (!looksLikeXml) {
            throw new IllegalArgumentException("Malformed XML payload");
        }
        return Map.of("valid", true, "type", "xml", "size", body.getBytes(StandardCharsets.UTF_8).length,
                "content", body);
    }

    @PostMapping(path = "/urlencoded", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public Map<String, Object> urlencoded(@RequestParam Map<String, String> fields) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("valid", !fields.isEmpty());
        result.put("type", "x-www-form-urlencoded");
        result.put("fields", fields);
        return result;
    }
}
