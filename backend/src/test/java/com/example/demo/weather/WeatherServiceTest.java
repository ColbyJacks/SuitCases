package com.example.demo.weather;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

class WeatherServiceTest {
    private static final String CONDITIONS = """
            {"latitude":29.42,"current":{"time":"2026-10-04T06:00",
            "temperature_2m":22.4,"wind_speed_10m":14.6,"precipitation":0,"weather_code":2,"interval":900}}
            """;
    private MockRestServiceServer server;
    private WeatherService service;

    @BeforeEach
    void setup() {
        var builder = RestClient.builder().baseUrl("https://weather.test/forecast");
        server = MockRestServiceServer.bindTo(builder).build();
        service = new WeatherService(builder.build());
    }

    @AfterEach
    void verifyRequests() {
        server.verify();
    }

    @Test
    void mapsProviderUnitsAndUtcTimes() {
        server.expect(queryParam("latitude", "29.4241"))
                .andExpect(queryParam("longitude", "-98.4936"))
                .andExpect(queryParam("current", "temperature_2m,precipitation,weather_code,wind_speed_10m"))
                .andExpect(queryParam("temperature_unit", "celsius"))
                .andExpect(queryParam("wind_speed_unit", "kmh"))
                .andExpect(queryParam("precipitation_unit", "mm"))
                .andExpect(queryParam("timezone", "UTC"))
                .andRespond(withSuccess(CONDITIONS, MediaType.APPLICATION_JSON));
        var first = service.getWeather(29.4241, -98.4936);
        assertThat(first.temperatureC()).isEqualTo(22.4);
        assertThat(first.windKmh()).isEqualTo(14.6);
        assertThat(first.precipitationMm()).isEqualTo(0.0);
        assertThat(first.weatherCode()).isEqualTo(2);
        assertThat(first.observedAt()).isEqualTo("2026-10-04T06:00:00Z");
        assertThat(first.fetchedAt()).isNotBlank();
        assertThat(first.source()).isEqualTo("Open-Meteo");
    }

    @Test
    void preservesMissingMeasurementsAsNull() {
        server.expect(queryParam("timezone", "UTC")).andRespond(withSuccess(
                "{\"current\":{\"time\":\"2026-10-04T06:00\",\"temperature_2m\":null}}", MediaType.APPLICATION_JSON));
        var response = service.getWeather(29.4241, -98.4936);
        assertThat(response.temperatureC()).isNull();
        assertThat(response.windKmh()).isNull();
        assertThat(response.precipitationMm()).isNull();
        assertThat(response.weatherCode()).isNull();
    }

    @ParameterizedTest
    @CsvSource({"91,0", "-91,0", "0,181", "0,-181", "NaN,0", "0,NaN", "Infinity,0", "0,-Infinity"})
    void rejectsInvalidCoordinatesBeforeCallingProvider(double latitude, double longitude) {
        assertThatThrownBy(() -> service.getWeather(latitude, longitude)).isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"current\":null}", "{\"current\":{\"time\":\"bad time\"}}", "not json"})
    void rejectsIncompleteOrUnreadableProviderResponses(String body) {
        server.expect(queryParam("timezone", "UTC")).andRespond(withSuccess(body, MediaType.APPLICATION_JSON));
        assertProviderStatus(HttpStatus.BAD_GATEWAY);
    }

    @Test
    void providerFailureDoesNotPreventNextRequestFromRecovering() {
        server.expect(queryParam("timezone", "UTC")).andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));
        server.expect(queryParam("timezone", "UTC")).andRespond(withSuccess(CONDITIONS, MediaType.APPLICATION_JSON));
        assertProviderStatus(HttpStatus.BAD_GATEWAY);
        assertThat(service.getWeather(29.4241, -98.4936).temperatureC()).isEqualTo(22.4);
    }

    @Test
    void reportsProviderRateLimitAsServiceUnavailable() {
        server.expect(queryParam("timezone", "UTC")).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));
        assertProviderStatus(HttpStatus.SERVICE_UNAVAILABLE);
    }

    private void assertProviderStatus(HttpStatus status) {
        assertThatThrownBy(() -> service.getWeather(29.4241, -98.4936))
                .isInstanceOfSatisfying(ResponseStatusException.class, error -> assertThat(error.getStatusCode()).isEqualTo(status));
    }

}
