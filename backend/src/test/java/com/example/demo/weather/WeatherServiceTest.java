package com.example.demo.weather;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.io.IOException;
import java.net.SocketTimeoutException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import com.sun.net.httpserver.HttpServer;
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
        var properties = new WeatherProperties(URI.create("https://weather.test/forecast"),
                Duration.ofSeconds(3), Duration.ofSeconds(8), Duration.ofMinutes(5), 500);
        service = new WeatherService(builder.build(), properties,
                Clock.fixed(Instant.parse("2026-10-04T06:01:00Z"), ZoneOffset.UTC));
    }

    @AfterEach
    void verifyRequests() {
        server.verify();
    }

    @Test
    void mapsProviderUnitsAndUtcTimesAndCachesOriginalFetch() {
        server.expect(queryParam("latitude", "29.4241"))
                .andExpect(queryParam("longitude", "-98.4936"))
                .andExpect(queryParam("current", "temperature_2m,precipitation,weather_code,wind_speed_10m"))
                .andExpect(queryParam("temperature_unit", "celsius"))
                .andExpect(queryParam("wind_speed_unit", "kmh"))
                .andExpect(queryParam("precipitation_unit", "mm"))
                .andExpect(queryParam("timezone", "UTC"))
                .andRespond(withSuccess(CONDITIONS, MediaType.APPLICATION_JSON));
        var first = service.getWeather(29.4241, -98.4936);
        assertThat(first).isEqualTo(new WeatherResponse(22.4, 14.6, 0.0, 2,
                "2026-10-04T06:00:00Z", "2026-10-04T06:01:00Z", "Open-Meteo"));
        assertThat(service.getWeather(29.4241, -98.4936)).isSameAs(first);
    }

    @Test
    void cachesDifferentCoordinatesSeparately() {
        server.expect(queryParam("latitude", "29.4241")).andRespond(withSuccess(CONDITIONS, MediaType.APPLICATION_JSON));
        server.expect(queryParam("latitude", "30.2672")).andRespond(withSuccess(CONDITIONS, MediaType.APPLICATION_JSON));
        service.getWeather(29.4241, -98.4936);
        service.getWeather(30.2672, -97.7431);
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
    void providerFailureIsNotCachedAndNextRequestCanRecover() {
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

    @Test
    void distinguishesTimeoutFromOtherConnectionFailures() {
        server.expect(queryParam("timezone", "UTC")).andRespond(request -> { throw new SocketTimeoutException("test timeout"); });
        server.expect(queryParam("timezone", "UTC")).andRespond(request -> { throw new IOException("test connection failure"); });
        assertProviderStatus(HttpStatus.GATEWAY_TIMEOUT);
        assertProviderStatus(HttpStatus.BAD_GATEWAY);
    }

    private void assertProviderStatus(HttpStatus status) {
        assertThatThrownBy(() -> service.getWeather(29.4241, -98.4936))
                .isInstanceOfSatisfying(WeatherProviderException.class, error -> assertThat(error.status()).isEqualTo(status));
    }

    @Test
    void enforcesConfiguredTimeoutWithRealHttpClient() throws Exception {
        var provider = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        provider.createContext("/forecast", exchange -> {
            try {
                Thread.sleep(1000);
                byte[] body = CONDITIONS.getBytes(java.nio.charset.StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, body.length);
                exchange.getResponseBody().write(body);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
            } finally { exchange.close(); }
        });
        provider.start();
        try {
            var properties = new WeatherProperties(URI.create("http://127.0.0.1:" + provider.getAddress().getPort() + "/forecast"),
                    Duration.ofSeconds(1), Duration.ofMillis(100), Duration.ofMinutes(5), 500);
            var realService = new WeatherService(properties);
            assertThatThrownBy(() -> realService.getWeather(29.4241, -98.4936))
                    .isInstanceOfSatisfying(WeatherProviderException.class,
                            error -> assertThat(error.status()).isEqualTo(HttpStatus.GATEWAY_TIMEOUT));
        } finally { provider.stop(0); }
    }
}
