package com.example.TestBackend.config;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

import com.example.TestBackend.auth.MockTokenService;
import tools.jackson.databind.ObjectMapper;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Configuration
public class SecurityConfig {

    @Bean
    SecurityFilterChain testApiSecurity(HttpSecurity http, MockAuthenticationFilter mockAuthenticationFilter)
            throws Exception {
        return http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(authorize -> authorize.anyRequest().permitAll())
                .addFilterBefore(mockAuthenticationFilter, AnonymousAuthenticationFilter.class)
                .build();
    }

    @Component
    static class MockAuthenticationFilter extends OncePerRequestFilter {

        private static final String BASIC_USERNAME = "mini";
        private static final String BASIC_PASSWORD = "postman";
        private static final String BEARER_TOKEN = "bearer-test-token";
        private static final String API_KEY = "minipostman-api-key";

        private final MockTokenService tokenService;
        private final ObjectMapper objectMapper;

        MockAuthenticationFilter(MockTokenService tokenService, ObjectMapper objectMapper) {
            this.tokenService = tokenService;
            this.objectMapper = objectMapper;
        }

        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
                throws ServletException, IOException {
            String path = request.getRequestURI();
            boolean accepted = switch (path) {
                case "/api/auth/basic" -> validBasic(request.getHeader(HttpHeaders.AUTHORIZATION));
                case "/api/auth/bearer" -> ("Bearer " + BEARER_TOKEN)
                        .equals(request.getHeader(HttpHeaders.AUTHORIZATION));
                case "/api/auth/api-key" -> API_KEY.equals(request.getHeader("X-API-Key"))
                        || API_KEY.equals(request.getParameter("api_key"));
                case "/api/auth/oauth" -> validOAuth(request.getHeader(HttpHeaders.AUTHORIZATION));
                default -> true;
            };

            if (!accepted) {
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                objectMapper.writeValue(response.getOutputStream(),
                        java.util.Map.of("authenticated", false, "error", "invalid_credentials"));
                return;
            }
            filterChain.doFilter(request, response);
        }

        private boolean validBasic(String authorization) {
            if (authorization == null || !authorization.startsWith("Basic ")) {
                return false;
            }
            try {
                String decoded = new String(Base64.getDecoder().decode(authorization.substring(6)), StandardCharsets.UTF_8);
                return (BASIC_USERNAME + ":" + BASIC_PASSWORD).equals(decoded);
            } catch (IllegalArgumentException exception) {
                return false;
            }
        }

        private boolean validOAuth(String authorization) {
            return authorization != null && authorization.startsWith("Bearer ")
                    && tokenService.isValidToken(authorization.substring(7));
        }
    }
}
