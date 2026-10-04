import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigation, Search, X } from 'lucide-react'
import type { Coordinate } from '../radar/radarEngine'
import { formatRouteDistance, formatRouteDuration } from '../radar/routeEngine'
import { errorMessage, searchDestinations } from './api'
import type { Destination, RoadRoute, SearchResult } from './types'

export function RouteControls({ position, destination, route, routing, routeError, onDestination, onRoute, onClear }: {
  position: Coordinate; destination?: Destination; route?: RoadRoute; routing: boolean; routeError?: string
  onDestination: (destination: Destination) => void; onRoute: () => void; onClear: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [message, setMessage] = useState('')
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])
  const search = async (event: FormEvent) => {
    event.preventDefault()
    const value = query.trim()
    if (value.length < 3) { setMessage('Enter at least 3 characters.'); return }
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setSearching(true); setResults([]); setMessage('')
    try {
      const found = await searchDestinations(value, position, controller.signal)
      if (controller.signal.aborted) return
      setResults(found)
      if (!found.length) setMessage('No destinations found. Try a city or street address, or tap the map.')
    } catch (error) { if (!controller.signal.aborted) setMessage(errorMessage(error)) }
    finally { if (!controller.signal.aborted) setSearching(false) }
  }
  return <section className="wt-route-controls" aria-label="Destination and routing">
    <form className="wt-search" onSubmit={search} role="search">
      <Search size={17} aria-hidden="true" />
      <input aria-label="Search destination" placeholder="Search a destination…" value={query} maxLength={160}
        onChange={event => { abort.current?.abort(); setSearching(false); setQuery(event.target.value); setResults([]); setMessage('') }} />
      <button type="submit" disabled={searching}>{searching ? 'Searching…' : 'Find'}</button>
    </form>
    {message && <p role="status" className="wt-search-message">{message}</p>}
    {!!results.length && <ul className="wt-search-results" aria-label="Destination results">{results.map(result => <li key={result.id}>
      <button type="button" onClick={() => { onDestination(result); setResults([]); setQuery(result.label) }}>{result.label}</button>
    </li>)}</ul>}
    {destination && <div className="wt-destination">
      <div className="wt-section-heading"><span>Destination</span><button type="button" onClick={onClear} aria-label="Clear destination"><X size={16} /></button></div>
      <p>{destination.label}</p>
      <div className="wt-button-row"><button className="wt-button wt-primary" type="button" disabled={routing} onClick={onRoute}>
        <Navigation size={15} /> {routing ? 'Finding route…' : route ? 'Refresh route' : 'Get route'}
      </button>{route && <strong>{formatRouteDuration(route.durationSeconds)} · {formatRouteDistance(route.distanceMeters)}</strong>}</div>
      {route && <small>{route.source} · {route.trafficAware ? 'Traffic-aware estimate' : 'Driving estimate · no live traffic'}</small>}
      {routeError && <p role="alert" className="wt-layer-error">{routeError}</p>}
    </div>}
  </section>
}
