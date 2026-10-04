package com.example.demo.weather;

import static org.hamcrest.Matchers.aMapWithSize;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

@SpringBootTest
@AutoConfigureMockMvc
class WeatherControllerTest {
    @Autowired
    private MockMvc mvc;
    @MockitoBean
    private WeatherService service;

    @Test
    void returnsFrontendContractWithoutBrowserCaching() throws Exception {
        when(service.getWeather(29.4241, -98.4936)).thenReturn(new WeatherResponse(22.4, 14.6, 0.0, 2,
                "2026-10-04T06:00:00Z", "2026-10-04T06:01:00Z", "Open-Meteo"));
        mvc.perform(get("/api/watchtower/weather").param("lat", "29.4241").param("lon", "-98.4936"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$", aMapWithSize(7)))
                .andExpect(jsonPath("$.temperatureC").value(22.4)).andExpect(jsonPath("$.windKmh").value(14.6))
                .andExpect(jsonPath("$.precipitationMm").value(0)).andExpect(jsonPath("$.weatherCode").value(2))
                .andExpect(jsonPath("$.source").value("Open-Meteo"))
                .andExpect(jsonPath("$.observedAt").value("2026-10-04T06:00:00Z"))
                .andExpect(jsonPath("$.fetchedAt").value("2026-10-04T06:01:00Z"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "not-a-number"})
    void rejectsMissingAndNonnumericCoordinates(String latitude) throws Exception {
        mvc.perform(get("/api/watchtower/weather").param("lat", latitude).param("lon", "-98.4936"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").exists());
        verifyNoInteractions(service);
    }

    @Test
    void requiresBothCoordinates() throws Exception {
        mvc.perform(get("/api/watchtower/weather").param("lat", "29.4241"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test
    void returnsValidationErrorFromService() throws Exception {
        when(service.getWeather(999, 0)).thenThrow(new IllegalArgumentException("invalid"));
        mvc.perform(get("/api/watchtower/weather").param("lat", "999").param("lon", "0"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void returnsProviderFailureWithoutInternalDetails() throws Exception {
        when(service.getWeather(29.4241, -98.4936)).thenThrow(new ResponseStatusException(
                HttpStatus.GATEWAY_TIMEOUT, "Weather provider timed out. Try again.", new RuntimeException("private diagnostic")));
        mvc.perform(get("/api/watchtower/weather").param("lat", "29.4241").param("lon", "-98.4936"))
                .andExpect(status().isGatewayTimeout()).andExpect(jsonPath("$", aMapWithSize(1)))
                .andExpect(jsonPath("$.message").value("Weather provider timed out. Try again."));
    }

    @Test
    void rateLimitResponseIncludesRetryHint() throws Exception {
        when(service.getWeather(29.4241, -98.4936)).thenThrow(new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE, "Weather provider is busy. Try again shortly.", null));
        mvc.perform(get("/api/watchtower/weather").param("lat", "29.4241").param("lon", "-98.4936"))
                .andExpect(status().isServiceUnavailable()).andExpect(header().string("Retry-After", "60"));
    }

    @Test
    void allowsConfiguredFrontendOriginWithCredentials() throws Exception {
        mvc.perform(options("/api/watchtower/weather").header("Origin", "http://localhost:5173")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"));
    }

    @Test
    void rejectsUnconfiguredCorsOrigin() throws Exception {
        mvc.perform(options("/api/watchtower/weather").header("Origin", "https://unconfigured.test")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }
}
