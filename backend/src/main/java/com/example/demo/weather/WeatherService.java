package com.example.demo.weather;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.net.SocketTimeoutException;
import java.net.http.HttpClient;
import java.net.http.HttpTimeoutException;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

@Service
public class WeatherService {
    private static final Logger log = LoggerFactory.getLogger(WeatherService.class);
    private final RestClient client;
    private final Clock clock;
    private final Cache<Coordinates, WeatherResponse> cache;

    @Autowired
    public WeatherService(@Value("${watchtower.weather.base-url}") String providerUrl,
            @Value("${watchtower.weather.cache-ttl}") Duration cacheTtl) {
        this(createClient(providerUrl, Duration.ofSeconds(8)), cacheTtl, Clock.systemUTC());
    }

    WeatherService(RestClient client, Duration cacheTtl, Clock clock) {
        this.client = client;
        this.clock = clock;
        this.cache = Caffeine.newBuilder()
                .maximumSize(500)
                .expireAfterWrite(cacheTtl)
                .build();
    }

    static RestClient createClient(String providerUrl, Duration readTimeout) {
        var httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(3))
                .build();
        var requests = new JdkClientHttpRequestFactory(httpClient);
        requests.setReadTimeout(readTimeout);
        return RestClient.builder()
                .baseUrl(providerUrl)
                .requestFactory(requests)
                .build();
    }

    public WeatherResponse getWeather(double latitude, double longitude) {
        if (!Double.isFinite(latitude) || Math.abs(latitude) > 90
                || !Double.isFinite(longitude) || Math.abs(longitude) > 180) {
            throw new IllegalArgumentException("Latitude must be between -90 and 90; longitude between -180 and 180.");
        }
        // Cache successful responses only. Caffeine also combines concurrent loads for the same coordinates.
        return cache.get(new Coordinates(latitude, longitude), this::fetchWeather);
    }

    private WeatherResponse fetchWeather(Coordinates coordinates) {
        try {
            var response = client.get()
                    .uri(builder -> builder
                            .queryParam("latitude", coordinates.latitude())
                            .queryParam("longitude", coordinates.longitude())
                            .queryParam("current", "temperature_2m,precipitation,weather_code,wind_speed_10m")
                            .queryParam("temperature_unit", "celsius")
                            .queryParam("wind_speed_unit", "kmh")
                            .queryParam("precipitation_unit", "mm")
                            .queryParam("timezone", "UTC")
                            .build())
                    .accept(MediaType.APPLICATION_JSON)
                    .retrieve()
                    .body(OpenMeteoResponse.class);
            if (response == null || response.current() == null || response.current().time() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Weather provider returned incomplete conditions.");
            }
            var current = response.current();
            String observedAt = LocalDateTime.parse(current.time()).toInstant(ZoneOffset.UTC).toString();
            return new WeatherResponse(
                    finite(current.temperature()), finite(current.wind()), finite(current.precipitation()),
                    current.weatherCode(), observedAt, clock.instant().toString(), "Open-Meteo");
        } catch (RestClientResponseException error) {
            log.warn("Weather provider returned HTTP {}", error.getStatusCode().value());
            if (error.getStatusCode().value() == 429) {
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Weather provider is busy. Try again shortly.", error);
            }
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Weather provider is unavailable. Try again.", error);
        } catch (ResourceAccessException error) {
            log.warn("Weather provider connection failed: {}", error.getClass().getSimpleName());
            boolean timeout = isTimeout(error);
            throw new ResponseStatusException(timeout ? HttpStatus.GATEWAY_TIMEOUT : HttpStatus.BAD_GATEWAY,
                    timeout ? "Weather provider timed out. Try again." : "Weather provider could not be reached. Try again.", error);
        } catch (RestClientException | DateTimeParseException error) {
            log.warn("Weather provider returned unreadable conditions: {}", error.getClass().getSimpleName());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Weather provider returned unreadable conditions.", error);
        }
    }

    private static Double finite(Double value) {
        if (value != null && !Double.isFinite(value)) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Weather provider returned invalid conditions.");
        }
        return value;
    }

    private static boolean isTimeout(Throwable error) {
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof HttpTimeoutException || cause instanceof SocketTimeoutException) return true;
        }
        return false;
    }

    private record Coordinates(double latitude, double longitude) {
    }
}
