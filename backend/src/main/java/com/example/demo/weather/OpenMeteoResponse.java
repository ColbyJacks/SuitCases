package com.example.demo.weather;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public record OpenMeteoResponse(Current current) {
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Current(
            String time,
            @JsonProperty("temperature_2m") Double temperature,
            @JsonProperty("wind_speed_10m") Double wind,
            Double precipitation,
            @JsonProperty("weather_code") Integer weatherCode) {
    }
}
