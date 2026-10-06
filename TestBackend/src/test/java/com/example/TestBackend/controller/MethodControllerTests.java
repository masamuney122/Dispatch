package com.example.TestBackend.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.springframework.http.HttpHeaders;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class MethodControllerTests {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void headReturnsSuccessHeaderWithoutBody() throws Exception {
        mockMvc.perform(head("/api/methods/head")
                        .header(HttpHeaders.ORIGIN, "http://localhost:5173"))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Method-Test", "HEAD request received"))
                .andExpect(header().string(
                        HttpHeaders.ACCESS_CONTROL_EXPOSE_HEADERS,
                        "X-Method-Test, X-Dispatch-Test, X-Dispatch-Multi, Allow, Location"))
                .andExpect(content().string(""));
    }

    @Test
    void optionsReturnsMethodConfirmationAndAllowHeader() throws Exception {
        mockMvc.perform(options("/api/methods/options"))
                .andExpect(status().isOk())
                .andExpect(header().string("Allow", "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS"))
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.method").value("OPTIONS"));
    }
}
