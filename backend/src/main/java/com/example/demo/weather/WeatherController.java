package com.example.demo.weather;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/watchtower")
public class WeatherController {
    private final WeatherService service;

    public WeatherController(WeatherService service) {
        this.service = service;
    }

    @GetMapping("/weather")
    public ResponseEntity<WeatherResponse> weather(@RequestParam("lat") double latitude, @RequestParam("lon") double longitude) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.getWeather(latitude, longitude));
    }
}
