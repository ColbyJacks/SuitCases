package com.example.demo.weather;

public record WeatherResponse(
        Double temperatureC,
        Double windKmh,
        Double precipitationMm,
        Integer weatherCode,
        String observedAt,
        String fetchedAt,
        String source) {
}
