
import { useMemo, useState } from 'react'
import { Crosshair, LocateFixed, MapPin, Navigation, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react'
import clsx from 'clsx'
import { Button, PanelShell, Section } from './PanelShell'
import { compassDirection, estimatedResponse, nearbyStations, type Coordinate, type Priority } from '../radar/radarEngine'


const DEMO_LOCATION: Coordinate = { latitude: 29.4241, longitude: -98.4936 }
const RANGES = [3, 5, 10, 20]

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

export function WatchtowerPanel({ onClose }: { onClose: () => void }) {
  const [location, setLocation] = useState<Coordinate>(DEMO_LOCATION)
  const [usingGps, setUsingGps] = useState(false)
  const [status, setStatus] = useState('DEMO POSITION')
  const [range, setRange] = useState(10)
  const [priority, setPriority] = useState<Priority>('Priority 1')
  const [locating, setLocating] = useState(false)

  const stations = useMemo(() => nearbyStations(location), [location])
  const nearest = stations[0]
  const response = estimatedResponse(priority, nearest.miles)

  const locate = () => {
    if (!navigator.geolocation) { setStatus('GEOLOCATION UNAVAILABLE'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude })
        setUsingGps(true)
        setStatus(`GPS LOCK · ±${Math.round(position.coords.accuracy)}M`)
        setLocating(false)
      },
      () => { setStatus('GPS DENIED · DEMO POSITION'); setLocating(false) },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )
  }

  return (
    <PanelShell id="watchtower" title="Watchtower" status={{ live: true, label: status, tone: usingGps ? 'green' : 'gold' }} onClose={onClose} wide bodyClassName="gap-5">
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
          <Navigation className="size-4 rotate-[var(--bearing)] text-mute" style={{ ['--bearing' as string]: `${nearest.bearing}deg` }} />
        </div>
      </Section>

      <Section label="Historical response estimate">
        <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/[.07] bg-white/[.025] p-1">
          {(['Priority 1', 'Priority 2', 'Priority 3'] as Priority[]).map((item) => <button key={item} onClick={() => setPriority(item)} className={clsx('rounded-lg py-2 font-mono text-[10px] transition-colors', priority === item ? 'bg-gold text-ink' : 'text-mute hover:bg-white/[.05] hover:text-paper')}>{item.replace('Priority ', 'P')}</button>)}
        </div>
        <div className="mt-2 flex items-center gap-3 rounded-xl border border-gold/15 bg-gold/[.045] p-3">
          <Crosshair className="size-5 shrink-0 text-gold" />
          <div><p className="font-mono text-lg tabular-nums text-paper">~{response.low}–{response.high} min</p><p className="text-xs text-mute">Prototype range for {priority.toLowerCase()}</p></div>
        </div>
      </Section>

      <Section label="Reference stations">
        <div className="space-y-1.5">
          {stations.slice(0, 3).map((station) => <div key={station.id} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-xs"><ShieldCheck className="size-3.5 text-emerald-300/70" /><span className="min-w-0 flex-1 truncate text-paper/80">{station.name}</span><span className="font-mono tabular-nums text-mute">{station.miles.toFixed(1)} mi · {compassDirection(station.bearing)}</span></div>)}
        </div>
      </Section>

      <div className="flex gap-2 rounded-xl border border-amber-200/10 bg-amber-200/[.035] p-3 text-[11px] leading-relaxed text-mute"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-gold" /><p>Prototype only. This is a station-proximity visualization, not live dispatch, officer, vehicle, or arrival-time tracking. Replace the bundled reference deck with City GIS data and the estimate model with published historical response data for a production version.</p></div>
    </PanelShell>
  )
}
