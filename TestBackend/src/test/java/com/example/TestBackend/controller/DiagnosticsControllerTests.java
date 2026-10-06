package com.example.TestBackend.controller;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class DiagnosticsControllerTests {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void returnsConfigurableStatusAndResponseShapes() throws Exception {
        mockMvc.perform(get("/api/diagnostics/status/418"))
                .andExpect(status().isIAmATeapot())
                .andExpect(jsonPath("$.status").value(418));

        mockMvc.perform(get("/api/diagnostics/response/headers"))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Dispatch-Test", "ready"));

        mockMvc.perform(get("/api/diagnostics/response/text"))
                .andExpect(status().isOk())
                .andExpect(content().string("Dispatch plain text response"));

        mockMvc.perform(get("/api/diagnostics/response/html"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("Dispatch preview")));

        mockMvc.perform(get("/api/diagnostics/response/empty"))
                .andExpect(status().isNoContent());
    }

    @Test
    void providesDeterministicRedirectsAndPayloadSizes() throws Exception {
        mockMvc.perform(get("/api/diagnostics/redirect"))
                .andExpect(status().isFound())
                .andExpect(header().string("Location", "/api/diagnostics/final"));

        mockMvc.perform(get("/api/diagnostics/redirect-chain").param("remaining", "2"))
                .andExpect(status().isFound())
                .andExpect(header().string("Location", "/api/diagnostics/redirect-chain?remaining=1"));

        mockMvc.perform(get("/api/diagnostics/response/binary").param("size", "32"))
                .andExpect(status().isOk())
                .andExpect(content().bytes(expectedBinary(32)));

        mockMvc.perform(get("/api/diagnostics/response/large").param("bytes", "128"))
                .andExpect(status().isOk())
                .andExpect(content().bytes("x".repeat(128).getBytes()));
    }

    private byte[] expectedBinary(int size) {
        byte[] bytes = new byte[size];
        for (int index = 0; index < size; index++) bytes[index] = (byte) (index % 251);
        return bytes;
    }
}
