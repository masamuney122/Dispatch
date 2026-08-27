package com.example.TestBackend.controller;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItems;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class CookieControllerTests {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void setsAndReadsCookieAttributes() throws Exception {
        mockMvc.perform(get("/api/cookies/set"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("dispatch_session=cookie-jar-works")))
                .andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("Path=/")))
                .andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("HttpOnly")))
                .andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("SameSite=Lax")));

        mockMvc.perform(get("/api/cookies/show").cookie(new Cookie("dispatch_session", "cookie-jar-works")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.received").value(true))
                .andExpect(jsonPath("$.cookies.dispatch_session").value("cookie-jar-works"));
    }

    @Test
    void redirectSetsCookieBeforeFollowingLocation() throws Exception {
        mockMvc.perform(get("/api/cookies/redirect"))
                .andExpect(status().isFound())
                .andExpect(header().string(HttpHeaders.LOCATION, "/api/cookies/redirect-target"))
                .andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("redirect_session=saved-during-redirect")));
    }

    @Test
    void deletesCookieWithZeroMaxAge() throws Exception {
        mockMvc.perform(delete("/api/cookies/delete"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deleted").value(true))
                .andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("Max-Age=0")));
    }

    @Test
    void clearsAllCookiesUsedByTheTestCollection() throws Exception {
        mockMvc.perform(delete("/api/cookies/clear-test-cookies"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cleared").value(true))
                .andExpect(jsonPath("$.cookies.length()").value(3))
                .andExpect(header().stringValues(HttpHeaders.SET_COOKIE, hasItems(
                        containsString("dispatch_session=;"),
                        containsString("redirect_session=;"),
                        containsString("scoped_cookie=;"))));
    }

    @Test
    void allowsCredentialedLocalWebRequests() throws Exception {
        mockMvc.perform(get("/api/cookies/show").header(HttpHeaders.ORIGIN, "http://localhost:5173"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:5173"))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS, "true"));
    }
}
