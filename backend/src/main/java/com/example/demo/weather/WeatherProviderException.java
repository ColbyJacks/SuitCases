package com.example.demo.weather;

import org.springframework.http.HttpStatus;

final class WeatherProviderException extends RuntimeException {
    private final HttpStatus status;

    WeatherProviderException(HttpStatus status, String message, Throwable cause) {
        super(message, cause);
        this.status = status;
    }

    HttpStatus status() {
        return status;
    }
}
