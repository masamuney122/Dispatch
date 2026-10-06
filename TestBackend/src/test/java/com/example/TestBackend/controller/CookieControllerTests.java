package com.example.TestBackend.controller;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItems;
import static org.hamcrest.Matchers.not;
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
    void supportsAllDocumentedSameSiteValues() throws Exception {
        for (String sameSite : new String[] { "Lax", "Strict", "None" }) {
            mockMvc.perform(get("/api/cookies/set").param("sameSite", sameSite))
                    .andExpect(status().isOk())
                    .andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("SameSite=" + sameSite)));
        }
    }

    @Test
    void emitsHostOnlyAndDomainCookies() throws Exception {
        mockMvc.perform(get("/api/cookies/set"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.SET_COOKIE, not(containsString("Domain="))));

        mockMvc.perform(get("/api/cookies/set").param("domain", "localhost"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("Domain=localhost")));
    }

    @Test
    void emitsPathAndSecureAttributesForJarMatchingTests() throws Exception {
        mockMvc.perform(get("/api/cookies/set")
                        .param("name", "secure_scoped")
                        .param("path", "/api/cookies/path")
                        .param("secure", "true"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("Path=/api/cookies/path")))
                .andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("Secure")));
    }

    @Test
    void acceptsPathBoundaryProbeEndpointsAndReturnsRawCookieHeader() throws Exception {
        Cookie scoped = new Cookie("scoped", "yes");
        mockMvc.perform(get("/api/cookies/path/show").cookie(scoped))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.path").value("/api/cookies/path/show"))
                .andExpect(jsonPath("$.rawCookieHeader", containsString("scoped=yes")));

        mockMvc.perform(get("/api/cookies/pathology/show"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.path").value("/api/cookies/pathology/show"))
                .andExpect(jsonPath("$.received").value(false));
    }

    @Test
    void emitsSeveralIndependentSetCookieHeaders() throws Exception {
        mockMvc.perform(get("/api/cookies/set-multiple"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(3))
                .andExpect(header().stringValues(HttpHeaders.SET_COOKIE, hasItems(
                        containsString("multi_root=root"),
                        containsString("multi_path=path"),
                        containsString("multi_session=session"))));
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
                .andExpect(jsonPath("$.cookies.length()").value(9))
                .andExpect(header().stringValues(HttpHeaders.SET_COOKIE, hasItems(
                        containsString("dispatch_session=;"),
                        containsString("redirect_session=;"),
                        containsString("boundary_cookie=;"),
                        containsString("multi_path=;"),
                        containsString("secure_cookie=;"),
                        containsString("persistent_cookie=;"))));
    }

    @Test
    void allowsCredentialedLocalWebRequests() throws Exception {
        mockMvc.perform(get("/api/cookies/show").header(HttpHeaders.ORIGIN, "http://localhost:5173"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:5173"))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS, "true"));
    }
}
