# Watchtower weather

Java 21 / Spring Boot, using your Spring Initializr starter. Install JDK 21 and set
`JAVA_HOME`; the Maven wrapper downloads dependencies on its first run. No API key
or database is needed for the noncommercial [Open-Meteo](https://open-meteo.com/en/docs) prototype.

From the repository root, run these in separate terminals:

```sh
npm run weather
npm run dev
```

Open Watchtower and enable **Weather**. Vite forwards `/api/watchtower/weather` to
Java on port 8080. Leave `VITE_WATCHTOWER_API_URL` blank when migrating only weather.
Direct startup from `backend/`: `./mvnw spring-boot:run`, or
`.\mvnw.cmd spring-boot:run` in Windows PowerShell.

`GET /api/watchtower/weather?lat=29.4241&lon=-98.4936` returns temperature in Celsius,
wind in km/h, precipitation in mm, WMO condition code, UTC `observedAt`/`fetchedAt`
timestamps and `source`. Measurements can be null. `observedAt` is the model-valid
time. The Java service requests current conditions from Open-Meteo for each request.

The panel refreshes every five minutes while visible, preserves the same location's
last readings on failures, and offers a retry button. Invalid coordinates return 400;
provider errors return 502 and rate limits return 503. Each refresh requests current
conditions directly from Open-Meteo.

| Setting | Default / use |
| --- | --- |
| `PORT` | `8080`, Java port |
| `WEATHER_PROVIDER_URL` | Open-Meteo forecast endpoint |
| `WATCHTOWER_CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` |
| `WATCHTOWER_SERVER_URL` | Vite proxy target: `http://127.0.0.1:8080` |
| `VITE_WATCHTOWER_WEATHER_API_URL` | Optional hosted API base, including `/api/watchtower` |

For deployment, run `./mvnw verify` in `backend/`, then
`java -jar target/watchtower-backend-0.0.1-SNAPSHOT.jar`. Static frontend hosts need a
reverse proxy for the endpoint or a weather API base set before building, with the
matching CORS origin. Vite's development proxy is not included in the static build.

Checks: `./mvnw verify` for backend tests; `npm run test:weather` (Node 22.6+) and
`npm run build` from the root for frontend checks. This implements current conditions;
forecast charts, imagery and severe-weather alerts remain future integrations.

Face swap server (Python, GPU) docs: see [FACESWAP.md](FACESWAP.md).
