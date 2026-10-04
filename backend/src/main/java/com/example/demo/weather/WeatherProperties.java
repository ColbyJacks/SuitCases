package com.example.demo.weather;

import java.net.URI;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("watchtower.weather")
public record WeatherProperties(
        URI baseUrl,
        Duration connectTimeout,
        Duration readTimeout,
        Duration cacheTtl,
        long cacheMaxEntries) {
    public WeatherProperties {
        if (baseUrl == null || !baseUrl.isAbsolute()
                || !("https".equals(baseUrl.getScheme()) || "http".equals(baseUrl.getScheme()))) {
            throw new IllegalArgumentException("Weather provider URL must be an absolute HTTP(S) URL.");
        }
        if (!positive(connectTimeout) || !positive(readTimeout) || !positive(cacheTtl) || cacheMaxEntries < 1) {
            throw new IllegalArgumentException("Weather timeouts, cache TTL and cache size must be positive.");
        }
    }

    private static boolean positive(Duration value) {
        return value != null && !value.isNegative() && !value.isZero();
    }
}
