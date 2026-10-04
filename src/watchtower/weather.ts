import type { WeatherData } from './types'

export const WEATHER_REFRESH_MS = 5 * 60_000
export const WEATHER_STALE_MS = 15 * 60_000

export function readWeather(value: unknown): WeatherData {
  const data = value as WeatherData | undefined
  const timestamp = (value: unknown) => typeof value === 'string'
    && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && Number.isFinite(Date.parse(value))
  if (!data || typeof data.source !== 'string' || !data.source.trim()
    || !timestamp(data.observedAt) || !timestamp(data.fetchedAt)
    || ![data.temperatureC, data.windKmh, data.precipitationMm, data.weatherCode].every(
      value => value === null || typeof value === 'number' && Number.isFinite(value))
    || data.weatherCode !== null && !Number.isInteger(data.weatherCode)) {
    throw new Error('Weather could not be read.')
  }
  return data
}

const CONDITIONS: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Rime fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  56: 'Light freezing drizzle', 57: 'Heavy freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  66: 'Light freezing rain', 67: 'Heavy freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light rain showers', 81: 'Rain showers', 82: 'Heavy rain showers',
  85: 'Light snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail',
}

export function weatherCondition(code: number | null) {
  return code === null ? 'Condition unavailable' : CONDITIONS[code] ?? 'Condition unavailable'
}

export function weatherIsStale(data: WeatherData, now = Date.now()) {
  return now - Date.parse(data.fetchedAt) > WEATHER_STALE_MS
}
