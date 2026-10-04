import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readWeather, weatherCondition, weatherIsStale, WEATHER_STALE_MS } from '../src/watchtower/weather.ts'

const conditions = {
  temperatureC: 0, windKmh: 0, precipitationMm: 0, weatherCode: 0,
  observedAt: '2026-10-04T06:00:00Z', fetchedAt: '2026-10-04T06:01:00Z', source: 'Open-Meteo',
}

test('zero measurements remain valid and missing measurements stay null', () => {
  assert.equal(readWeather(conditions).temperatureC, 0)
  const missing = { ...conditions, temperatureC: null, windKmh: null, precipitationMm: null, weatherCode: null }
  assert.equal(readWeather(missing).temperatureC, null)
  assert.equal(weatherCondition(missing.weatherCode), 'Condition unavailable')
})

test('rejects invalid payloads before displaying them as conditions', () => {
  for (const value of [null, {}, { ...conditions, source: '' }, { ...conditions, temperatureC: '22' },
    { ...conditions, windKmh: Infinity }, { ...conditions, weatherCode: 1.5 },
    { ...conditions, observedAt: '2026-10-04T06:00:00' }, { ...conditions, fetchedAt: 'invalid' }]) {
    assert.throws(() => readWeather(value), /Weather could not be read/)
  }
})

test('condition labels distinguish clear weather, showers, hail and unknown codes', () => {
  assert.equal(weatherCondition(0), 'Clear sky')
  assert.equal(weatherCondition(82), 'Heavy rain showers')
  assert.equal(weatherCondition(99), 'Thunderstorm with heavy hail')
  assert.equal(weatherCondition(999), 'Condition unavailable')
})

test('freshness uses the backend fetch time rather than the condition time', () => {
  const fetched = Date.parse(conditions.fetchedAt)
  assert.equal(weatherIsStale(conditions, fetched + WEATHER_STALE_MS - 1), false)
  assert.equal(weatherIsStale(conditions, fetched + WEATHER_STALE_MS + 1), true)
})
