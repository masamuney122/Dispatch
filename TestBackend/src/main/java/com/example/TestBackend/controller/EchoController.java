package com.example.TestBackend.controller;

import java.util.Collections;
import java.util.Enumeration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class EchoController {

    @RequestMapping("/api/echo")
    public Map<String, Object> echo(HttpServletRequest request) {
        Map<String, List<String>> parameters = new LinkedHashMap<>();
        request.getParameterMap().forEach((key, values) -> parameters.put(key, List.of(values)));

        Map<String, String> headers = new LinkedHashMap<>();
        Enumeration<String> headerNames = request.getHeaderNames();
        if (headerNames != null) {
            Collections.list(headerNames).forEach(name -> headers.put(name.toLowerCase(), request.getHeader(name)));
        }

        return Map.of(
                "method", request.getMethod(),
                "path", request.getRequestURI(),
                "parameters", parameters,
                "headers", headers);
    }
}
