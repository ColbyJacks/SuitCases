package com.example.demo.config;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WatchtowerWebConfiguration implements WebMvcConfigurer {
    private final List<String> allowedOrigins;

    public WatchtowerWebConfiguration(@Value("${watchtower.cors.allowed-origins}") List<String> allowedOrigins) {
        this.allowedOrigins = allowedOrigins;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/watchtower/weather")
                .allowedOrigins(allowedOrigins.toArray(String[]::new))
                .allowedMethods("GET")
                .allowCredentials(true)
                .maxAge(3600);
    }
}
