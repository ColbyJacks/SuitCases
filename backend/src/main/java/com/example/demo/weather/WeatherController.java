package com.example.demo.weather;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;

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

    @ExceptionHandler({MissingServletRequestParameterException.class, MethodArgumentTypeMismatchException.class, IllegalArgumentException.class})
    ResponseEntity<WeatherError> invalidCoordinates() {
        return ResponseEntity.badRequest().cacheControl(CacheControl.noStore()).body(new WeatherError(
                "Provide numeric lat (-90 to 90) and lon (-180 to 180)."));
    }

    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<WeatherError> providerFailure(ResponseStatusException error) {
        var response = ResponseEntity.status(error.getStatusCode()).cacheControl(CacheControl.noStore());
        if (error.getStatusCode() == HttpStatus.SERVICE_UNAVAILABLE) response.header("Retry-After", "60");
        return response.body(new WeatherError(error.getReason()));
    }

    private record WeatherError(String message) {}
}
