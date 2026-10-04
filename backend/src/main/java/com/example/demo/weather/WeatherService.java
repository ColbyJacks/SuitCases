package com.example.demo.weather;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

@Service
public class WeatherService {
    private final RestClient client;

    @Autowired
    public WeatherService(@Value("${watchtower.weather.base-url}") String providerUrl) {
        this(RestClient.builder().baseUrl(providerUrl).build());
    }

    WeatherService(RestClient client) {
        this.client = client;
    }

    public WeatherResponse getWeather(double latitude, double longitude) {
        if (!Double.isFinite(latitude) || Math.abs(latitude) > 90
                || !Double.isFinite(longitude) || Math.abs(longitude) > 180) {
            throw new IllegalArgumentException("Latitude must be between -90 and 90; longitude between -180 and 180.");
        }

        try {
            var response = client.get()
                    .uri(uri -> uri
                            .queryParam("latitude", latitude)
                            .queryParam("longitude", longitude)
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
            var observedAt = LocalDateTime.parse(current.time()).toInstant(ZoneOffset.UTC).toString();
            return new WeatherResponse(current.temperature(), current.wind(), current.precipitation(),
                    current.weatherCode(), observedAt, Instant.now().toString(), "Open-Meteo");
        } catch (RestClientResponseException error) {
            var status = error.getStatusCode().value() == 429
                    ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.BAD_GATEWAY;
            throw new ResponseStatusException(status, "Weather provider is unavailable. Try again.");
        } catch (RestClientException | DateTimeParseException error) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Weather provider returned unreadable conditions.");
        }
    }
}
