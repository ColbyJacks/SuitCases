import { requestRoadRoute } from '../radar/routeEngine'
import type { Coordinate } from '../radar/radarEngine'
import { validCoordinate, type Capabilities, type LayerPayload, type MarkerLayer, type RoadRoute, type SearchResult, type WeatherData } from './types'

// Set to the Java service's /api/watchtower base. Never put provider secrets in VITE_* variables.
export const JAVA_API_BASE = (import.meta.env.VITE_WATCHTOWER_API_URL ?? '').trim().replace(/\/$/, '')

export async function getJson(url: string, signal?: AbortSignal, init?: RequestInit): Promise<unknown> {
  const timeout = AbortSignal.timeout(20_000)
  const response = await fetch(url, { ...init, signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
  if (!response.ok) throw new Error(response.status === 429 ? 'Too many requests. Try again shortly.' : 'This data source is unavailable. Try again.')
  if (!response.headers.get('content-type')?.includes('json')) throw new Error('The service returned an unexpected response.')
  return response.json()
}

export async function getCapabilities(signal: AbortSignal): Promise<Capabilities> {
  const data = await getJson(`${JAVA_API_BASE}/capabilities`, signal, { credentials: 'include' }) as Capabilities
  if (!Array.isArray(data.layers)) throw new Error('Service capabilities are unavailable.')
  return data
}

export async function searchDestinations(query: string, origin: Coordinate, signal: AbortSignal): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query, lat: String(origin.latitude), lon: String(origin.longitude), limit: '5' })
  if (JAVA_API_BASE) {
    const data = await getJson(`${JAVA_API_BASE}/geocode?${params}`, signal, { credentials: 'include' }) as { results: SearchResult[] }
    if (!Array.isArray(data.results)) throw new Error('Search results could not be read.')
    return data.results.filter(result => typeof result.label === 'string' && validCoordinate(result.position)).slice(0, 5)
  }
  const data = await getJson(`https://photon.komoot.io/api/?${params}`, signal) as {
    features?: { geometry?: { coordinates?: number[] }; properties?: Record<string, string | number> }[]
  }
  if (!Array.isArray(data.features)) throw new Error('Search results could not be read.')
  return data.features.flatMap((feature, index) => {
    const [longitude, latitude] = feature.geometry?.coordinates ?? []
    const position = { latitude, longitude }
    const props = feature.properties ?? {}
    const label = [...new Set([props.name, props.street, props.city, props.state, props.country].filter(Boolean))].join(', ')
    return validCoordinate(position) && label ? [{ id: `photon-${props.osm_id ?? index}`, label, position }] : []
  })
}

export async function getRoute(start: Coordinate, destination: Coordinate, signal: AbortSignal): Promise<RoadRoute> {
  if (!JAVA_API_BASE) {
    const route = await requestRoadRoute(start, destination, AbortSignal.any([signal, AbortSignal.timeout(20_000)]))
    return { ...route, source: 'OSRM', trafficAware: false }
  }
  const route = await getJson(`${JAVA_API_BASE}/routes`, signal, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start, destination, mode: 'driving' }),
  }) as RoadRoute
  if (!Array.isArray(route.coordinates) || route.coordinates.length < 2 || !route.coordinates.every(validCoordinate)
    || !Number.isFinite(route.distanceMeters) || route.distanceMeters < 0 || !Number.isFinite(route.durationSeconds) || route.durationSeconds < 0) {
    throw new Error('The route could not be read.')
  }
  return route
}

export async function getWeather(position: Coordinate, signal: AbortSignal): Promise<WeatherData> {
  const params = new URLSearchParams({ lat: String(position.latitude), lon: String(position.longitude) })
  if (JAVA_API_BASE) {
    const data = await getJson(`${JAVA_API_BASE}/weather?${params}`, signal, { credentials: 'include' }) as WeatherData
    if (!data || typeof data.source !== 'string' || typeof data.observedAt !== 'string' || typeof data.fetchedAt !== 'string'
      || ![data.temperatureC, data.windKmh, data.precipitationMm, data.weatherCode].every(value => value === null || typeof value === 'number' && Number.isFinite(value))) throw new Error('Weather could not be read.')
    return data
  }
  const query = new URLSearchParams({ latitude: String(position.latitude), longitude: String(position.longitude),
    current: 'temperature_2m,precipitation,weather_code,wind_speed_10m', timezone: 'UTC' })
  const data = await getJson(`https://api.open-meteo.com/v1/forecast?${query}`, signal) as { current?: Record<string, number | string | null> }
  if (!data.current || typeof data.current.time !== 'string') throw new Error('Weather could not be read.')
  const number = (key: string) => typeof data.current![key] === 'number' && Number.isFinite(data.current![key]) ? data.current![key] as number : null
  return { temperatureC: number('temperature_2m'), windKmh: number('wind_speed_10m'), precipitationMm: number('precipitation'),
    weatherCode: number('weather_code'), observedAt: `${data.current.time}Z`, fetchedAt: new Date().toISOString(), source: 'Open-Meteo' }
}

export async function getLayer(layer: MarkerLayer, position: Coordinate, radiusMeters: number, signal: AbortSignal, operationId?: string): Promise<LayerPayload> {
  if (JAVA_API_BASE) {
    const paths: Record<MarkerLayer, string> = { crew: 'positions', vehicles: 'assets', objectives: 'objectives', traffic: 'hazards', places: 'places' }
    if (['crew', 'vehicles', 'objectives'].includes(layer) && !operationId) throw new Error('Join an operation to load this layer.')
    const path = ['crew', 'vehicles', 'objectives'].includes(layer) ? `operations/${encodeURIComponent(operationId!)}/${paths[layer]}` : paths[layer]
    const params = new URLSearchParams({ lat: String(position.latitude), lon: String(position.longitude), radiusMeters: String(radiusMeters), layer })
    const data = await getJson(`${JAVA_API_BASE}/${path}?${params}`, signal, { credentials: 'include' }) as LayerPayload
    if (!Array.isArray(data.markers)) throw new Error('Layer data could not be read.')
    if (typeof data.fetchedAt !== 'string') throw new Error('Layer timestamps could not be read.')
    return { ...data, markers: data.markers.filter(marker => marker && marker.layer === layer && validCoordinate(marker.position)
      && typeof marker.id === 'string' && typeof marker.label === 'string' && typeof marker.source === 'string' && typeof marker.simulated === 'boolean') }
  }
  if (layer !== 'places') throw new Error('Connect the operations service to load this layer, or enable sample markers.')
  const radius = Math.min(3000, Math.max(500, radiusMeters))
  const query = `[out:json][timeout:15];nwr["amenity"~"^(hospital|fuel|parking)$"](around:${Math.round(radius)},${position.latitude},${position.longitude});out center 40;`
  const data = await getJson('https://overpass-api.de/api/interpreter', signal, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ data: query }).toString(),
  }) as { elements?: { id: number; type: string; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] }
  if (!Array.isArray(data.elements)) throw new Error('Nearby places could not be read.')
  return { fetchedAt: new Date().toISOString(), markers: data.elements.flatMap(item => {
    const position = { latitude: item.lat ?? item.center?.lat!, longitude: item.lon ?? item.center?.lon! }
    const category = item.tags?.amenity ?? 'Place'
    return validCoordinate(position) ? [{ id: `osm-${item.type}-${item.id}`, layer: 'places' as const, label: item.tags?.name ?? category,
      position, description: item.tags?.['addr:street'] ?? category, status: category, source: 'OpenStreetMap / Overpass', simulated: false }] : []
  }) }
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}
