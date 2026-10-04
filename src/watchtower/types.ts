import type { Coordinate } from '../radar/radarEngine'

export type LayerId = 'crew' | 'vehicles' | 'objectives' | 'traffic' | 'weather' | 'places'
export type DataStatus = 'idle' | 'loading' | 'ready' | 'stale' | 'unavailable'
export type MarkerLayer = Exclude<LayerId, 'weather'>

export type WatchtowerMarker = {
  id: string
  layer: MarkerLayer
  label: string
  position: Coordinate
  description?: string
  status?: string
  observedAt?: string
  accuracyMeters?: number
  source: string
  simulated: boolean
}

export type LayerPayload = { markers: WatchtowerMarker[]; fetchedAt: string }
export type LayerState = {
  status: DataStatus
  data?: LayerPayload
  error?: string
}
export type WeatherData = {
  temperatureC: number | null
  windKmh: number | null
  precipitationMm: number | null
  weatherCode: number | null
  observedAt: string
  fetchedAt: string
  source: string
}
export type WeatherState = { status: DataStatus; data?: WeatherData; error?: string }
export type SearchResult = { id: string; label: string; position: Coordinate }
export type Destination = { label: string; position: Coordinate }
export type RoadRoute = {
  coordinates: Coordinate[]
  distanceMeters: number
  durationSeconds: number
  source: string
  trafficAware: boolean
}
export type Capabilities = { layers: LayerId[]; operationId?: string }

export const LAYERS: { id: LayerId; label: string; color: string; symbol: string }[] = [
  { id: 'crew', label: 'Crew', color: '#65efba', symbol: 'C' },
  { id: 'vehicles', label: 'Assets', color: '#7ec8ff', symbol: 'V' },
  { id: 'objectives', label: 'Objectives', color: '#efc779', symbol: 'O' },
  { id: 'traffic', label: 'Traffic', color: '#ff9e75', symbol: '!' },
  { id: 'weather', label: 'Weather', color: '#b4a4fa', symbol: 'W' },
  { id: 'places', label: 'Places', color: '#a3c5bc', symbol: '+' },
]

export const DEMO_POSITION: Coordinate = { latitude: 29.4241, longitude: -98.4936 }
export const SAMPLE_LAYERS: MarkerLayer[] = ['crew', 'vehicles', 'objectives', 'traffic']
export const METERS_PER_MILE = 1609.344

export function validCoordinate(value: unknown): value is Coordinate {
  if (!value || typeof value !== 'object') return false
  const { latitude, longitude } = value as Coordinate
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
}
