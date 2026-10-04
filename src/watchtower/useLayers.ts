import { useEffect, useState } from 'react'
import type { Coordinate } from '../radar/radarEngine'
import { errorMessage, getCapabilities, getLayer, getWeather, JAVA_API_BASE } from './api'
import { sampleLayer } from './demoData'
import { LAYERS, SAMPLE_LAYERS, type Capabilities, type LayerId, type LayerState, type MarkerLayer, type WeatherState } from './types'

export function useLayers(position: Coordinate, enabled: Record<LayerId, boolean>, samples: boolean, radiusMeters: number, refresh: number) {
  const [states, setStates] = useState<Record<LayerId, LayerState>>(() => Object.fromEntries(LAYERS.map(layer => [layer.id, { status: 'idle' }])) as Record<LayerId, LayerState>)
  const [weather, setWeather] = useState<WeatherState>({ status: 'idle' })
  const [capabilities, setCapabilities] = useState<Capabilities>()
  const [connection, setConnection] = useState(JAVA_API_BASE ? 'Connecting' : 'Public sources')

  useEffect(() => {
    if (!JAVA_API_BASE) return
    const abort = new AbortController()
    getCapabilities(abort.signal).then(data => { setCapabilities(data); setConnection('Operations connected') }).catch(() => {
      if (!abort.signal.aborted) setConnection('Operations unavailable')
    })
    return () => abort.abort()
  }, [refresh])

  const enabledKey = LAYERS.filter(layer => enabled[layer.id]).map(layer => layer.id).join(',')
  useEffect(() => {
    const abort = new AbortController()
    const active = enabledKey.split(',').filter(Boolean) as LayerId[]
    for (const { id } of LAYERS) {
      if (id === 'weather') continue
      if (!active.includes(id)) {
        setStates(previous => ({ ...previous, [id]: { status: 'idle' } }))
        continue
      }
      if (samples && SAMPLE_LAYERS.includes(id)) {
        setStates(previous => ({ ...previous, [id]: { status: 'ready', data: sampleLayer(id as MarkerLayer) } }))
        continue
      }
      if (JAVA_API_BASE && capabilities && !capabilities.layers.includes(id)) {
        setStates(previous => ({ ...previous, [id]: { status: 'unavailable', error: 'This layer is not connected yet.' } }))
        continue
      }
      setStates(previous => ({ ...previous, [id]: { status: 'loading' } }))
      getLayer(id, position, radiusMeters, abort.signal, capabilities?.operationId).then(data => {
        if (!abort.signal.aborted) setStates(previous => ({ ...previous, [id]: { status: 'ready', data } }))
      }).catch(error => {
        if (!abort.signal.aborted) setStates(previous => ({ ...previous, [id]: { status: 'unavailable', error: errorMessage(error) } }))
      })
    }
    return () => abort.abort()
  }, [enabledKey, samples, position.latitude, position.longitude, radiusMeters, refresh, capabilities])

  useEffect(() => {
    if (!enabled.weather) { setWeather({ status: 'idle' }); return }
    if (JAVA_API_BASE && capabilities && !capabilities.layers.includes('weather')) {
      setWeather({ status: 'unavailable', error: 'Weather is not connected yet.' }); return
    }
    const abort = new AbortController()
    setWeather({ status: 'loading' })
    getWeather(position, abort.signal).then(data => {
      if (!abort.signal.aborted) setWeather({ status: 'ready', data })
    }).catch(error => {
      if (!abort.signal.aborted) setWeather({ status: 'unavailable', error: errorMessage(error) })
    })
    return () => abort.abort()
  }, [enabled.weather, position.latitude, position.longitude, refresh, capabilities])

  // Age is distinct from request success. A source may provide an old position or observation.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setStates(previous => Object.fromEntries(Object.entries(previous).map(([id, state]) => [id,
        state.status === 'ready' && state.data && !state.data.markers.every(marker => marker.simulated)
          && Date.now() - Date.parse(state.data.fetchedAt) > 5 * 60_000 ? { ...state, status: 'stale' } : state,
      ])) as Record<LayerId, LayerState>)
      setWeather(previous => previous.status === 'ready' && previous.data && Date.now() - Date.parse(previous.data.fetchedAt) > 15 * 60_000
        ? { ...previous, status: 'stale' } : previous)
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const layerStates: Record<LayerId, LayerState> = { ...states, weather: { status: weather.status, error: weather.error } }
  return { states: layerStates, weather, connection }
}
