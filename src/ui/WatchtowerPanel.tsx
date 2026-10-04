import { useEffect, useRef, useState } from 'react'
import { Crosshair, LocateFixed, Radio } from 'lucide-react'
import { PanelShell } from './PanelShell'
import { WatchtowerMap, type MapFocus } from '../watchtower/WatchtowerMap'
import { LayerControls } from '../watchtower/LayerControls'
import { RouteControls } from '../watchtower/RouteControls'
import { MarkerDetails } from '../watchtower/MarkerDetails'
import { WeatherCard } from '../watchtower/WeatherCard'
import { errorMessage, getRoute, JAVA_API_BASE } from '../watchtower/api'
import { useLayers } from '../watchtower/useLayers'
import { DEMO_POSITION, LAYERS, METERS_PER_MILE, type Destination, type LayerId, type RoadRoute } from '../watchtower/types'
import type { Coordinate } from '../radar/radarEngine'
import { formatRouteDistance, formatRouteDuration } from '../radar/routeEngine'
import '../watchtower/watchtower.css'

export function WatchtowerPanel({ onClose }: { onClose: () => void }) {
  const [position, setPosition] = useState(DEMO_POSITION)
  const [accuracy, setAccuracy] = useState<number>()
  const [gps, setGps] = useState(false)
  const [locating, setLocating] = useState(false)
  const [gpsError, setGpsError] = useState('')
  const [radar, setRadar] = useState(true)
  const [rangeMiles, setRangeMiles] = useState(1)
  const [samples, setSamples] = useState(!JAVA_API_BASE)
  const [enabled, setEnabled] = useState<Record<LayerId, boolean>>({ crew: true, vehicles: true, objectives: true, traffic: false, weather: false, places: false })
  const [refresh, setRefresh] = useState(0)
  const [weatherRefresh, setWeatherRefresh] = useState(0)
  const [selectedId, setSelectedId] = useState<string>()
  const [destination, setDestination] = useState<Destination>()
  const [route, setRoute] = useState<RoadRoute>()
  const [routing, setRouting] = useState(false)
  const [routeError, setRouteError] = useState<string>()
  const [focus, setFocus] = useState<MapFocus>()
  const routeAbort = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const { states, weather, connection } = useLayers(position, enabled, samples, rangeMiles * METERS_PER_MILE, refresh, weatherRefresh)
  const markers = LAYERS.flatMap(layer => enabled[layer.id] ? states[layer.id].data?.markers ?? [] : [])
  const selected = markers.find(marker => marker.id === selectedId)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; routeAbort.current?.abort() }
  }, [])

  const focusOn = (position: Coordinate) => setFocus(previous => ({ position, sequence: (previous?.sequence ?? 0) + 1 }))
  const clearRoute = () => { routeAbort.current?.abort(); setRoute(undefined); setRouteError(undefined); setRouting(false) }
  const chooseDestination = (next: Destination) => { clearRoute(); setDestination(next); focusOn(next.position) }
  const locate = () => {
    if (!navigator.geolocation) { setGpsError('Location is unavailable in this browser.'); return }
    setLocating(true); setGpsError('')
    navigator.geolocation.getCurrentPosition(result => {
      if (!mounted.current) return
      const next = { latitude: result.coords.latitude, longitude: result.coords.longitude }
      setPosition(next); setAccuracy(result.coords.accuracy); setGps(true); setLocating(false)
      clearRoute(); focusOn(next)
    }, error => {
      if (!mounted.current) return
      setLocating(false)
      setGpsError(error.code === 1 ? 'Location permission was denied. You can still use the map and search.' : 'Could not obtain your location. Try again.')
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 })
  }
  const requestRoute = async () => {
    if (!destination) return
    routeAbort.current?.abort()
    const controller = new AbortController()
    routeAbort.current = controller
    setRouting(true); setRouteError(undefined); setRoute(undefined)
    try {
      const result = await getRoute(position, destination.position, controller.signal)
      if (!controller.signal.aborted) setRoute(result)
    } catch (error) { if (!controller.signal.aborted) setRouteError(errorMessage(error)) }
    finally { if (!controller.signal.aborted) setRouting(false) }
  }

  return <PanelShell id="watchtower" title="Watchtower" status={{ live: gps, label: gps ? 'GPS POSITION' : 'DEMO POSITION', tone: gps ? 'green' : 'gold' }}
    onClose={onClose} className="watchtower-shell" bodyClassName="watchtower-body">
    <div className="wt-toolbar">
      <div className="wt-source"><Radio size={14} /><span>{connection}</span><span className="wt-badge">{samples ? 'Sample markers' : 'Sample markers off'}</span></div>
      <div className="wt-map-controls">
        <button type="button" className="wt-button" onClick={locate} disabled={locating}><LocateFixed size={16} /> {locating ? 'Locating…' : 'Use my location'}</button>
        <button type="button" className="wt-button wt-icon-button" onClick={() => focusOn(position)} aria-label="Center on my position"><Crosshair size={17} /></button>
        <button type="button" className={`wt-button ${radar ? 'wt-active' : ''}`} aria-pressed={radar} onClick={() => setRadar(value => !value)}>Radar overlay</button>
        <label className="wt-range">Range <select aria-label="Radar range" value={rangeMiles} onChange={event => setRangeMiles(Number(event.target.value))}>
          {[.5, 1, 3, 5].map(value => <option value={value} key={value}>{value} mi</option>)}
        </select></label>
      </div>
      {gpsError && <p role="alert" className="wt-layer-error">{gpsError}</p>}
    </div>
    <div className="wt-workspace">
      <WatchtowerMap position={position} accuracy={accuracy} markers={markers} selectedId={selectedId} destination={destination} route={route}
        radar={radar} radiusMeters={rangeMiles * METERS_PER_MILE} focus={focus} onSelect={setSelectedId}
        onDestination={position => chooseDestination({ position, label: `Map pin · ${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}` })} />
      <div className="wt-sidebar">
        <RouteControls position={position} destination={destination} route={route} routing={routing} routeError={routeError}
          onDestination={chooseDestination} onRoute={() => void requestRoute()} onClear={() => { clearRoute(); setDestination(undefined) }} />
        <LayerControls enabled={enabled} states={states} samples={samples} onToggle={id => setEnabled(previous => ({ ...previous, [id]: !previous[id] }))}
          onSamples={setSamples} onRefresh={() => setRefresh(value => value + 1)} />
        {selected && <MarkerDetails marker={selected} position={position} onClose={() => setSelectedId(undefined)}
          onFocus={() => focusOn(selected.position)} onDestination={() => chooseDestination({ label: selected.label, position: selected.position })} />}
        {enabled.weather && <WeatherCard weather={weather} demo={!gps} onRefresh={() => setWeatherRefresh(value => value + 1)} />}
        {!selected && <p className="wt-help">Select a marker for its details. Search a destination or tap the map to plan an ordinary driving route.</p>}
      </div>
    </div>
    <footer className="wt-status-strip" aria-live="polite">
      <span>{gps ? `GPS · ±${Math.round(accuracy ?? 0)} m` : 'Demo position · San Antonio'}</span>
      <span>{markers.length} markers{markers.some(marker => marker.simulated) ? ' · includes samples' : ''}</span>
      <span>{route ? `${formatRouteDuration(route.durationSeconds)} · ${formatRouteDistance(route.distanceMeters)}` : routing ? 'Finding route…' : 'No active route'}</span>
    </footer>
  </PanelShell>
}
