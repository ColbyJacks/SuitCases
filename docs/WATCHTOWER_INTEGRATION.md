# Watchtower frontend and Java integration

Watchtower now uses a single Leaflet map, optional geographic radar rings and
decorative sweep, destination search, route geometry, selectable markers, and
independent layer states. The other suitcase modules keep their existing backend.
The weather slice now has an implemented Java backend in `backend/`; the remaining
Java contracts below are prepared for later migration.

## Provider decisions

Checked 2026-10-04. Prototype requests using San Antonio coordinates returned
HTTP 200, the expected JSON shape, and `Access-Control-Allow-Origin: *` from
Photon, OSRM, Open-Meteo and Overpass. This is a compatibility check, not an
availability guarantee. Provider failures remain visible and can be retried.

| Capability | Selected provider | Reason / boundary |
| --- | --- | --- |
| Frontend map | Existing Leaflet 1.9 / React Leaflet 5 | Fits existing React 19 dependencies; no package additions |
| Road tiles | Attributed OSM standard tiles, configurable | Small interactive prototype; no prefetch/offline download. Configure a suitable production provider. CARTO currently requires a key. |
| Destination search | Photon | GeoJSON, location-biased search, Java self-hosting option; explicit submit limits demo traffic |
| Initial routes | OSRM | Existing route engine and GeoJSON; ordinary driving estimates without live traffic |
| Weather conditions | Open-Meteo | No key needed for noncommercial prototype; conditions are model data, not safety alerts |
| Nearby places | Overpass / OSM | Hospitals, fuel and parking; radius capped at 3 km and result count at 40 |
| Future traffic and traffic-aware routes | TomTom | One provider for traffic flow/incidents and traffic-aware route calculations; key stays in Java |
| Future US severe-weather alerts | NWS | Dedicated official alert API; not implemented in the current weather layer |
| Future crew updates | Spring WebSocket/STOMP | Authenticated operation-scoped position/status events |
| Future GPS assets | Traccar | Existing Java GPS server and documented REST API |
| Future voice | LiveKit | Java-compatible token SDK and React audio controls; separate media service |
| Future USB/network hardware | jSerialComm / HiveMQ MQTT client | Local USB bridge or network broker; hosted Java cannot access a client's USB port |

Source documentation:
- https://react-leaflet.js.org/docs/start-installation/
- https://operations.osmfoundation.org/policies/tiles/
- https://github.com/CartoDB/basemap-styles
- https://github.com/komoot/photon/blob/master/docs/api-v1.md
- https://project-osrm.org/docs/v5.24.0/api/
- https://open-meteo.com/en/docs and https://open-meteo.com/en/terms
- https://dev.overpass-api.de/overpass-doc/en/
- https://docs.tomtom.com/routing-api/documentation/tomtom-maps/v1/calculate-route
- https://www.weather.gov/documentation/services-web-api
- https://spring.io/guides/gs/messaging-stomp-websocket/
- https://github.com/traccar/traccar/blob/master/openapi.yaml
- https://github.com/livekit/server-sdk-kotlin
- https://github.com/Fazecast/jSerialComm/wiki/Usage-Examples
- https://github.com/hivemq/hivemq-mqtt-client

## Current behavior

By default the crew/assets/objectives/traffic layers use explicitly labeled,
fixed fictional San Antonio markers. They never represent live tracking or road
closures. Turn off **Sample markers** to see which layers require a service.
Places request public data only when enabled. Weather requests the Java service only
when enabled; Java calls Open-Meteo and caches successful conditions for five minutes.
Changing the user's GPS position does not relocate the fictional scenario.
GPS is a one-time, permission-based lookup and is not shared with teammates.

Search is submitted explicitly. Route changes cancel earlier requests. Clearing
a destination clears its route; changing the origin also clears the route.
Radar/layer changes preserve the destination and current route. Selecting a
marker does not also drop a destination. Sample traffic does not modify routes.
Map tile failures, empty search/place results and provider errors have visible
states. Layer responses become stale after five minutes; weather after fifteen.
Weather refreshes every five minutes while the panel and layer are visible, retries
on demand, and retains the same location's last readings with a stale label on failures.
Position markers with observation timestamps older than two minutes are muted.

The public adapters send the selected location/query to their respective
providers. No backend accounts, live crew sharing, voice rooms or hardware
connections are implied by enabling sample markers.

## Java contract

### Implemented weather slice

Run `npm run weather` with JDK 21, alongside `npm run dev`, and enable Weather.
The default `/api/watchtower/weather` request is proxied by Vite to port 8080.
Leave the general Java URL blank when migrating only weather. A dedicated
`VITE_WATCHTOWER_WEATHER_API_URL` overrides the weather base without redirecting
search, routes or places. Default proxy target: `WATCHTOWER_SERVER_URL=http://127.0.0.1:8080`.
See [backend/README.md](../backend/README.md) for the runnable service and deployment.
Static hosts require an API reverse proxy or an absolute weather base configured at build time.

The weather backend returns the existing `WeatherData` shape, nullable numeric readings,
UTC timestamps and the Open-Meteo source. Its `observedAt` field is the model-valid time,
not a weather-station observation. The panel decodes WMO conditions and distinguishes
retrieval age from condition time. Weather does not fall back to direct public requests
when Java fails.

### Prepared contracts for remaining features

Set `VITE_WATCHTOWER_API_URL` to the Java service base, e.g.
`http://localhost:8080/api/watchtower`. All JSON adapters then use that service;
they do not silently fall back to public services on failure. Tiles continue to
use the separately configured tile provider. Build-time `VITE_*` variables are
public; provider secrets belong only in server configuration.

Use CORS for the exact frontend origin with credential support when origins
differ, and authenticate membership before operation endpoints. A deployment
may route `/api/watchtower` to Java through its reverse proxy. The existing Vite
AI plugin and Python voice proxy are unchanged.

All coordinates are `{ latitude, longitude }` in WGS84. JSON distance is meters,
duration is seconds, and timestamps are ISO-8601 with a timezone. Convert provider
GeoJSON `[longitude, latitude]` coordinates at the Java adapter boundary.

| Request relative to base | Normalized response |
| --- | --- |
| `GET /capabilities` | `{ layers: LayerId[], operationId?: string }` |
| `GET /geocode?q=...&lat=...&lon=...&limit=5` | `{ results: SearchResult[] }` |
| `POST /routes` with `{ start, destination, mode: "driving" }` | `RoadRoute` |
| `GET /weather?lat=...&lon=...` | `WeatherData` |
| `GET /places?lat=...&lon=...&radiusMeters=...&layer=places` | `LayerPayload` |
| `GET /hazards?lat=...&lon=...&radiusMeters=...&layer=traffic` | `LayerPayload` |
| `GET /operations/{id}/positions` (same location/radius query) | `LayerPayload` for crew |
| `GET /operations/{id}/assets` (same query) | `LayerPayload` for vehicles |
| `GET /operations/{id}/objectives` (same query) | `LayerPayload` for objectives |

`src/watchtower/types.ts` is the authoritative frontend contract. Example:

```json
{
  "markers": [{
    "id": "crew-123",
    "layer": "crew",
    "label": "Echo",
    "position": { "latitude": 29.4241, "longitude": -98.4936 },
    "observedAt": "2026-10-04T04:00:00Z",
    "accuracyMeters": 12,
    "status": "Ready",
    "source": "Operation crew",
    "simulated": false
  }],
  "fetchedAt": "2026-10-04T04:00:05Z"
}
```

`RoadRoute` requires `coordinates`, `distanceMeters`, `durationSeconds`, `source`
and `trafficAware`. `WeatherData` requires nullable numbers `temperatureC`,
`windKmh`, `precipitationMm`, `weatherCode`, and strings `observedAt`, `fetchedAt`,
`source`. The frontend renders empty place results as zero markers.

## Later slices

1. Java authentication, database and controllers for the remaining features (weather is implemented).
2. Actual operation selection, saved objectives and opt-in position sharing.
3. Authenticated STOMP updates (current layers use request/refresh).
4. TomTom traffic, NWS alert polygons and a traffic-aware routing adapter.
5. LiveKit audio, Traccar trackers, local USB and MQTT adapters.
6. Optional population/historical activity context and fictional simulation.

Do not infer police arrival or response times from route durations, station
proximity, or call-clearance timestamps. The old station/response UI is removed;
geographic helpers remain available for distances and bearings.

## Verification for this frontend change

- Production TypeScript/Vite build and diff whitespace checks pass.
- Live Photon search, Open-Meteo weather and OSRM routing rendered in the full
  suitcase UI without runtime exceptions; Overpass endpoint compatibility was
  checked separately.
- Browser scenarios cover desktop/mobile layout, marker selection, layer/radar
  toggles preserving routes, empty places, provider failure, denied GPS, and
  cancellation preventing old routes from reappearing.
- A mock Java service verifies capabilities, operation-scoped layer requests,
  normalized geocoding/weather and route POST payloads. These earlier checks cover
  prepared contracts; the implemented weather service has its own isolated backend tests.

### Weather implementation verification

- `cd backend && ./mvnw verify`: provider mapping, UTC times, null readings, coordinate
  validation, cache reuse/isolation, provider failures/recovery, timeouts, HTTP errors and CORS.
- `npm run test:weather`: frontend response validation, condition labels and freshness.
- `npm run build`: frontend TypeScript and production bundle.
- Live Java → Open-Meteo → Vite checks confirm real conditions, coordinate validation
  and cache timestamps. Desktop/mobile browser checks cover rendering, failed refresh
  retaining stale readings, retry, GPS changes, cancellation of old location requests,
  automatic refresh and stopping requests when the layer is hidden, without runtime errors.
