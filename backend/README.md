# Watchtower weather backend

Java 21 / Spring Boot 4.1.1 project based on the supplied Spring Initializr starter.
The application package is still `com.example.demo`; `DemoApplication` is its entry point.

## Run

Install JDK 21 and set `JAVA_HOME` to that installation. Maven is provided by the wrapper;
the first run downloads Maven and dependencies. No weather API key or database is needed
for the noncommercial Open-Meteo prototype.

From the repository root, run these in separate terminals:

```sh
npm run weather
npm run dev
```

Open Watchtower and enable **Weather**. The frontend requests `/api/watchtower/weather`;
Vite proxies only that endpoint to Java on port 8080. Search, routes and places retain
their existing public adapters. Leave `VITE_WATCHTOWER_API_URL` blank while migrating
only weather. Closing the panel or hiding the layer cancels requests and stops refreshes.

Alternatively, from `backend/`:

```sh
./mvnw spring-boot:run
```

Windows PowerShell: `.\mvnw.cmd spring-boot:run`.

## Endpoint

```sh
curl "http://localhost:8080/api/watchtower/weather?lat=29.4241&lon=-98.4936"
```

```json
{
  "temperatureC": 22.4,
  "windKmh": 14.6,
  "precipitationMm": 0,
  "weatherCode": 2,
  "observedAt": "2026-10-04T06:00:00Z",
  "fetchedAt": "2026-10-04T06:01:00Z",
  "source": "Open-Meteo"
}
```

Example values above are illustrative. Measurements can be null. `observedAt` is the
provider's model-valid time in UTC, not a station observation; `fetchedAt` is when Java
retrieved the conditions. Cache hits preserve the original timestamp. Measurements are
Celsius, km/h and millimeters; precipitation is for the provider's current interval.

Successful responses are cached by coordinates for five minutes, with at most 500 entries.
Concurrent requests for the same coordinates share one provider load. Failures are not cached.
Browser caching is disabled. The panel refreshes every five minutes while enabled and visible,
preserves previous conditions on a failed refresh, and offers a retry button. A changed
position clears the previous location's readings.

Invalid/missing/nonfinite coordinates return 400. Upstream failures or invalid JSON return
502, provider rate limits return 503 with `Retry-After: 60`, and timeouts return 504. The
provider connection timeout is three seconds and response timeout eight seconds.

## Configuration and deployment

| Environment variable | Default / purpose |
| --- | --- |
| `PORT` | `8080`, Java listening port |
| `WEATHER_PROVIDER_URL` | Open-Meteo forecast endpoint; backend-only setting for testing or a compatible deployment |
| `WEATHER_CACHE_TTL` | `5m`, server cache duration |
| `WATCHTOWER_CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173`, exact permitted frontend origins |
| `WATCHTOWER_SERVER_URL` | `http://127.0.0.1:8080`, Vite proxy target in the root `.env.local` |
| `VITE_WATCHTOWER_WEATHER_API_URL` | Blank: use the general Java base if configured, otherwise `/api/watchtower`; set an absolute base for a separately hosted weather service |

Restart Vite after changing frontend settings. For a static production frontend, configure
the host's reverse proxy to route `/api/watchtower/weather` to Java, or set the weather
base URL before building and configure the matching CORS origin. Vite's development proxy
is not part of the static build. Java must remain running; the frontend does not silently
switch to a different weather source on errors.

Package the server with `./mvnw verify`, then run
`java -jar target/watchtower-backend-0.0.1-SNAPSHOT.jar`. Optional local-only binding:
`./mvnw spring-boot:run -Dspring-boot.run.profiles=local`.

## Tests and sources

`./mvnw verify` runs isolated tests for provider mapping, nullable readings, validation,
caching, recovery, timeouts, HTTP responses and CORS; it does not call the public provider.
Frontend checks: `npm run test:weather` from the repository root (Node 22.6+).

- [Open-Meteo API and WMO codes](https://open-meteo.com/en/docs)
- [Open-Meteo terms](https://open-meteo.com/en/terms): hosted free API is for noncommercial use; commercial hosted use requires a subscription.
- [Spring RestClient](https://docs.spring.io/spring-framework/reference/integration/rest-clients.html)

This slice implements current weather conditions. Forecast charts, weather imagery and
official severe-weather alerts remain separate future integrations.
