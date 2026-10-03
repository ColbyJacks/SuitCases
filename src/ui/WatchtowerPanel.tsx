import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { LocateFixed, Map as MapIcon, MapPin, Navigation, Radar, RefreshCw, Route, ShieldCheck, X } from 'lucide-react'
import clsx from 'clsx'
import 'leaflet/dist/leaflet.css'
import { Button, ErrorNote, Note, PanelShell, Section } from './PanelShell'
import { compassDirection, nearbyStations, type Coordinate } from '../radar/radarEngine'
import { formatRouteDistance, formatRouteDuration, requestRoadRoute, type RoadRoute } from '../radar/routeEngine'

const DEMO_LOCATION: Coordinate = { latitude: 29.4241, longitude: -98.4936 }
const RANGES = [3, 5, 10, 20]

type ViewMode = 'radar' | 'map'

const toLatLng = ({ latitude, longitude }: Coordinate): [number, number] => [latitude, longitude]

function RadarDisplay({ location, range, stations }: { location: Coordinate; range: number; stations: ReturnType<typeof nearbyStations> }) {
  const center = 150
  const usableRadius = 112

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[310px] overflow-hidden rounded-full border border-emerald-300/25 bg-[#031b17] shadow-[inset_0_0_70px_rgba(12,247,184,0.14),0_0_44px_rgba(12,247,184,0.08)]">
      <svg viewBox="0 0 300 300" className="size-full" role="img" aria-label="Station proximity radar">
        <defs>
          <radialGradient id="radarFade"><stop offset="0%" stopColor="#16e6b1" stopOpacity=".16" /><stop offset="100%" stopColor="#16e6b1" stopOpacity="0" /></radialGradient>
          <linearGradient id="radarSweep" x1="0" x2="1"><stop stopColor="#41f7bf" stopOpacity=".55" /><stop offset="1" stopColor="#41f7bf" stopOpacity="0" /></linearGradient>
        </defs>
        <circle cx={center} cy={center} r="148" fill="url(#radarFade)" />
        {[38, 75, 112].map((r) => <circle key={r} cx={center} cy={center} r={r} fill="none" stroke="#5df8cf" strokeOpacity=".22" strokeWidth="1" />)}
        <path d="M150 25V275M25 150H275" stroke="#5df8cf" strokeOpacity=".17" />
        <g className="origin-center animate-[spin_4.8s_linear_infinite]" style={{ transformOrigin: '150px 150px' }}>
          <path d="M150 150 L150 25 A125 125 0 0 1 267 105 Z" fill="url(#radarSweep)" />
          <path d="M150 150 L150 25" stroke="#baffdf" strokeWidth="1.2" strokeOpacity=".95" />
        </g>
        <text x="150" y="18" textAnchor="middle" fill="#9af5d1" fontSize="10" fontFamily="monospace">N</text>
        <text x="285" y="154" textAnchor="middle" fill="#9af5d1" fontSize="10" fontFamily="monospace">E</text>
        <text x="150" y="292" textAnchor="middle" fill="#9af5d1" fontSize="10" fontFamily="monospace">S</text>
        <text x="15" y="154" textAnchor="middle" fill="#9af5d1" fontSize="10" fontFamily="monospace">W</text>
        {stations.map((station) => {
          const radius = Math.min(usableRadius, (station.miles / range) * usableRadius)
          const angle = (station.bearing * Math.PI) / 180
          const x = center + Math.sin(angle) * radius
          const y = center - Math.cos(angle) * radius
          const outOfRange = station.miles > range
          return <g key={station.id} transform={`translate(${x} ${y})`} className={outOfRange ? 'opacity-45' : ''}>
            <circle r="7" fill="#d9ae59" fillOpacity=".18" className="animate-ping" />
            <circle r="3.5" fill="#f4ce78" />
            <text x="7" y="-7" fill="#f7ddb0" fontSize="8" fontFamily="monospace">{station.area}</text>
          </g>
        })}
        <circle cx={center} cy={center} r="7" fill="#e8fff5" stroke="#36f4bd" strokeWidth="3" />
        <circle cx={center} cy={center} r="15" fill="none" stroke="#36f4bd" strokeOpacity=".42" strokeWidth="1" />
      </svg>
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-emerald-200/15 bg-[#041b18]/90 px-3 py-1 font-mono text-[10px] tracking-[.15em] text-emerald-100/80">YOU · {location.latitude.toFixed(3)}, {location.longitude.toFixed(3)}</div>
    </div>
  )
}

function DestinationPicker({ onPick }: { onPick: (destination: Coordinate) => void }) {
  useMapEvents({
    click(event) {
      onPick({ latitude: event.latlng.lat, longitude: event.latlng.lng })
    },
  })
  return null
}

function MapViewport({ location, route }: { location: Coordinate; route: RoadRoute | null }) {
  const map = useMap()

  useEffect(() => {
    if (route && route.coordinates.length > 1) {
      map.fitBounds(route.coordinates.map(toLatLng), { padding: [28, 28], maxZoom: 14 })
      return
    }
    map.flyTo(toLatLng(location), 13, { duration: 0.7 })
  }, [location, map, route])

  return null
}

function RoadMap({
  location,
  destination,
  route,
  onPickDestination,
}: {
  location: Coordinate
  destination: Coordinate | null
  route: RoadRoute | null
  onPickDestination: (destination: Coordinate) => void
}) {
  const routePositions = route?.coordinates.map(toLatLng) ?? []

  return (
    <div className="watchtower-map h-[310px] overflow-hidden rounded-2xl border border-emerald-200/15 bg-[#031b17] shadow-[inset_0_0_40px_rgba(12,247,184,0.08)]">
      <MapContainer center={toLatLng(location)} zoom={13} className="size-full" zoomControl={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapViewport location={location} route={route} />
        <DestinationPicker onPick={onPickDestination} />
        <CircleMarker center={toLatLng(location)} radius={8} pathOptions={{ color: '#a4ffe1', fillColor: '#2bf5b8', fillOpacity: 0.95, weight: 2 }}>
          <Popup>You are here</Popup>
        </CircleMarker>
        {destination && (
          <CircleMarker center={toLatLng(destination)} radius={8} pathOptions={{ color: '#fff1c5', fillColor: '#d9ae59', fillOpacity: 0.98, weight: 2 }}>
            <Popup>Destination</Popup>
          </CircleMarker>
        )}
        {routePositions.length > 1 && <Polyline positions={routePositions} pathOptions={{ color: '#f0c56d', weight: 5, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }} />}
      </MapContainer>
    </div>
  )
}

export function WatchtowerPanel({ onClose }: { onClose: () => void }) {
  const [location, setLocation] = useState<Coordinate>(DEMO_LOCATION)
  const [usingGps, setUsingGps] = useState(false)
  const [status, setStatus] = useState('DEMO POSITION')
  const [range, setRange] = useState(10)
  const [view, setView] = useState<ViewMode>('radar')
  const [locating, setLocating] = useState(false)
  const [destination, setDestination] = useState<Coordinate | null>(null)
  const [route, setRoute] = useState<RoadRoute | null>(null)
  const [routing, setRouting] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)
  const routeAbort = useRef<AbortController | null>(null)

  const stations = useMemo(() => nearbyStations(location), [location])
  const nearest = stations[0]

  useEffect(() => () => { routeAbort.current?.abort() }, [])

  const locate = () => {
    if (!navigator.geolocation) { setStatus('GEOLOCATION UNAVAILABLE'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude })
        setUsingGps(true)
        setStatus(`GPS LOCK · ±${Math.round(position.coords.accuracy)}M`)
        setRoute(null)
        setRouteError(null)
        setLocating(false)
      },
      () => { setStatus('GPS DENIED · DEMO POSITION'); setLocating(false) },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )
  }

  const pickDestination = (nextDestination: Coordinate) => {
    setDestination(nextDestination)
    setRoute(null)
    setRouteError(null)
  }

  const buildRoute = async () => {
    if (!destination) return
    routeAbort.current?.abort()
    const controller = new AbortController()
    routeAbort.current = controller
    setRouting(true)
    setRouteError(null)

    try {
      const nextRoute = await requestRoadRoute(location, destination, controller.signal)
      if (routeAbort.current === controller) setRoute(nextRoute)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (routeAbort.current === controller) setRouteError(error instanceof Error ? error.message : 'Unable to build this route.')
    } finally {
      if (routeAbort.current === controller) setRouting(false)
    }
  }

  return (
    <PanelShell id="watchtower" title="Watchtower" status={{ live: true, label: status, tone: usingGps ? 'green' : 'gold' }} onClose={onClose} wide bodyClassName="gap-5">
      <div role="tablist" aria-label="Watchtower view" className="grid grid-cols-2 rounded-xl border border-white/[.07] bg-black/20 p-1">
        <button role="tab" aria-selected={view === 'radar'} onClick={() => setView('radar')} className={clsx('flex items-center justify-center gap-2 rounded-lg py-2 font-mono text-[10px] uppercase tracking-[.12em] transition-colors', view === 'radar' ? 'bg-emerald-300 text-[#062018]' : 'text-mute hover:bg-white/[.05] hover:text-paper')}><Radar className="size-3.5" /> Radar</button>
        <button role="tab" aria-selected={view === 'map'} onClick={() => setView('map')} className={clsx('flex items-center justify-center gap-2 rounded-lg py-2 font-mono text-[10px] uppercase tracking-[.12em] transition-colors', view === 'map' ? 'bg-gold text-ink' : 'text-mute hover:bg-white/[.05] hover:text-paper')}><MapIcon className="size-3.5" /> Road map</button>
      </div>

      {view === 'radar' ? (
        <>
          <div className="rounded-2xl border border-emerald-200/10 bg-gradient-to-b from-emerald-400/[.06] to-transparent p-3">
            <RadarDisplay location={location} range={range} stations={stations.slice(0, 4)} />
            <div className="mt-3 flex items-center justify-center gap-1.5">
              {RANGES.map((value) => <button key={value} onClick={() => setRange(value)} className={clsx('rounded-lg px-2.5 py-1 font-mono text-[11px] transition-colors', range === value ? 'bg-emerald-300 text-[#062018]' : 'text-mute hover:bg-white/[.05] hover:text-paper')}>{value} MI</button>)}
            </div>
          </div>

          <Button variant="primary" icon={locating ? RefreshCw : LocateFixed} onClick={locate} disabled={locating} className="w-full">
            {locating ? 'Acquiring GPS…' : 'Use my location'}
          </Button>

          <Section label="Nearest facility" aside={<span className="font-mono text-[10px] text-emerald-200/70">{nearest.miles.toFixed(1)} MI</span>}>
            <div className="flex items-center gap-3 rounded-xl border border-white/[.07] bg-white/[.025] p-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-gold/10 text-gold"><MapPin className="size-5" /></span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm text-paper">{nearest.name}</p><p className="mt-0.5 font-mono text-[10px] tracking-wide text-mute">{nearest.area} · {compassDirection(nearest.bearing)} · {Math.round(nearest.bearing)}°</p></div>
              <Navigation className="size-4 text-mute" style={{ transform: `rotate(${nearest.bearing}deg)` }} />
            </div>
          </Section>

          <Section label="Reference stations">
            <div className="space-y-1.5">
              {stations.slice(0, 3).map((station) => <div key={station.id} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-xs"><ShieldCheck className="size-3.5 text-emerald-300/70" /><span className="min-w-0 flex-1 truncate text-paper/80">{station.name}</span><span className="font-mono tabular-nums text-mute">{station.miles.toFixed(1)} mi · {compassDirection(station.bearing)}</span></div>)}
            </div>
          </Section>
        </>
      ) : (
        <>
          <div className="rounded-2xl border border-emerald-200/10 bg-gradient-to-b from-emerald-400/[.06] to-transparent p-2">
            <RoadMap location={location} destination={destination} route={route} onPickDestination={pickDestination} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" icon={locating ? RefreshCw : LocateFixed} onClick={locate} disabled={locating}>{locating ? 'Acquiring…' : 'Use my location'}</Button>
            <Button variant="primary" icon={routing ? RefreshCw : Route} onClick={buildRoute} disabled={!destination || routing}>{routing ? 'Building…' : 'Build route'}</Button>
          </div>

          <Section label="Destination">
            {destination ? (
              <div className="flex items-center gap-3 rounded-xl border border-gold/20 bg-gold/[.045] p-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-gold/15 text-gold"><Navigation className="size-5" /></span>
                <div className="min-w-0 flex-1"><p className="text-sm text-paper">Map target selected</p><p className="mt-0.5 font-mono text-[10px] tracking-wide text-mute">{destination.latitude.toFixed(5)}, {destination.longitude.toFixed(5)}</p></div>
                <button onClick={() => { setDestination(null); setRoute(null); setRouteError(null) }} aria-label="Clear destination" className="rounded-lg p-2 text-mute transition-colors hover:bg-white/[.06] hover:text-paper"><X className="size-4" /></button>
              </div>
            ) : <Note icon={MapPin}>Click a point on the map to set a destination.</Note>}
          </Section>

          {route && (
            <Section label="Road route">
              <div className="grid grid-cols-2 rounded-xl border border-emerald-200/15 bg-emerald-300/[.045] p-1">
                <div className="rounded-lg p-2.5"><p className="font-mono text-lg tabular-nums text-paper">{formatRouteDuration(route.durationSeconds)}</p><p className="mt-0.5 font-mono text-[9px] uppercase tracking-[.16em] text-mute">Estimated drive</p></div>
                <div className="border-l border-emerald-200/10 p-2.5"><p className="font-mono text-lg tabular-nums text-paper">{formatRouteDistance(route.distanceMeters)}</p><p className="mt-0.5 font-mono text-[9px] uppercase tracking-[.16em] text-mute">Road distance</p></div>
              </div>
            </Section>
          )}

          {routeError && <ErrorNote>{routeError}</ErrorNote>}
          <Note icon={Navigation}>Normal driving route only — verify current conditions before you travel.</Note>
        </>
      )}

      <Note>Station locations are a bundled reference deck. The road map and routing do not track incidents, emergency services, or avoidance criteria.</Note>
    </PanelShell>
  )
}
