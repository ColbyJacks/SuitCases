import { useEffect, useState } from 'react'
import type { Coordinate } from '../radar/radarEngine'
import { errorMessage, getWeather } from './api'
import type { WeatherState } from './types'
import { WEATHER_REFRESH_MS, weatherIsStale } from './weather'

export function useWeather(position: Coordinate, enabled: boolean, refresh: number, permitted: boolean): WeatherState {
  const { latitude, longitude } = position
  const point = `${latitude},${longitude}`
  const [weather, setWeather] = useState<WeatherState & { point: string }>({ status: 'idle', point: '' })

  useEffect(() => {
    if (!enabled || !permitted) return
    const abort = new AbortController()
    let inFlight = false
    const load = async () => {
      if (inFlight || abort.signal.aborted) return
      inFlight = true
      setWeather(previous => ({ point, status: 'loading', data: previous.point === point ? previous.data : undefined }))
      try {
        const data = await getWeather({ latitude, longitude }, abort.signal)
        if (!abort.signal.aborted) setWeather({ point, status: weatherIsStale(data) ? 'stale' : 'ready', data })
      } catch (error) {
        if (!abort.signal.aborted) setWeather(previous => ({
          point, status: previous.data ? 'stale' : 'unavailable', data: previous.data, error: errorMessage(error),
        }))
      } finally { inFlight = false }
    }
    void load()
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, WEATHER_REFRESH_MS)
    const visible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', visible)
    return () => {
      abort.abort()
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [latitude, longitude, point, enabled, refresh, permitted])

  useEffect(() => {
    if (!enabled) return
    const timer = window.setInterval(() => setWeather(previous => previous.status === 'ready'
      && previous.data && weatherIsStale(previous.data) ? { ...previous, status: 'stale' } : previous), 30_000)
    return () => window.clearInterval(timer)
  }, [enabled])

  if (!enabled) return { status: 'idle' }
  if (!permitted) return { status: 'unavailable', error: 'Weather is not connected yet.' }
  return weather.point === point ? weather : { status: 'loading' }
}
