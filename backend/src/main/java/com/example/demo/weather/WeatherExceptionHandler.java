package com.example.demo.weather;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice(assignableTypes = WeatherController.class)
public class WeatherExceptionHandler {
    @ExceptionHandler({MissingServletRequestParameterException.class, MethodArgumentTypeMismatchException.class, IllegalArgumentException.class})
    ResponseEntity<WeatherError> invalidCoordinates(Exception error) {
        return ResponseEntity.badRequest().cacheControl(CacheControl.noStore()).body(new WeatherError(
                "Provide numeric lat (-90 to 90) and lon (-180 to 180)."));
    }

    @ExceptionHandler(WeatherProviderException.class)
    ResponseEntity<WeatherError> providerFailure(WeatherProviderException error) {
        var response = ResponseEntity.status(error.status()).cacheControl(CacheControl.noStore());
        if (error.status() == HttpStatus.SERVICE_UNAVAILABLE) response.header("Retry-After", "60");
        return response.body(new WeatherError(error.getMessage()));
    }

    public record WeatherError(String message) {
    }
}
