import { useEffect, useMemo, useRef, useState } from 'react'
import { Circle, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { divIcon, latLngBounds, type Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Coordinate } from '../radar/radarEngine'
import { RadarOverlay } from './RadarOverlay'
import { LAYERS, type Destination, type RoadRoute, type WatchtowerMarker } from './types'

export type MapFocus = { position: Coordinate; sequence: number }
const tuple = (position: Coordinate): [number, number] => [position.latitude, position.longitude]
const tileUrl = import.meta.env.VITE_WATCHTOWER_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const attribution = import.meta.env.VITE_WATCHTOWER_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

function icon(symbol: string, color: string, size: number, selected = false, stale = false) {
  // Only fixed symbols/colors from our layer registry are interpolated into HTML.
  return divIcon({ html: `<span class="wt-pin${selected ? ' is-selected' : ''}${stale ? ' is-stale' : ''}" style="--pin-color:${color};--wt-pin-size:${size}px;--wt-pin-font:${Math.max(9, size * .43)}px">${symbol}</span>`,
    className: 'wt-marker', iconSize: [size, size], iconAnchor: [size / 2, size / 2] })
}

function MapEvents({ onDestination, onReady, onZoom, focus, route }: { onDestination: (position: Coordinate) => void; onReady: (map: LeafletMap) => void; onZoom: (zoom: number) => void; focus?: MapFocus; route?: RoadRoute }) {
  const map = useMap()
  useMapEvents({
    click: event => onDestination({ latitude: event.latlng.lat, longitude: event.latlng.lng }),
    zoomend: () => onZoom(map.getZoom()),
  })
  useEffect(() => {
    onReady(map)
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }))
    observer.observe(map.getContainer())
    const timer = window.setTimeout(() => map.invalidateSize(), 800)
    return () => { observer.disconnect(); window.clearTimeout(timer) }
  }, [map, onReady])
  useEffect(() => { if (focus) map.flyTo(tuple(focus.position), Math.max(14, map.getZoom()), { duration: .6 }) }, [map, focus])
  useEffect(() => {
    if (route?.coordinates.length) map.fitBounds(latLngBounds(route.coordinates.map(tuple)), { padding: [48, 48], maxZoom: 16 })
  }, [map, route])
  return null
}

export function WatchtowerMap({ position, accuracy, markers, selectedId, destination, route, radar, radiusMeters, focus, onSelect, onDestination }: {
  position: Coordinate; accuracy?: number; markers: WatchtowerMarker[]; selectedId?: string; destination?: Destination; route?: RoadRoute
  radar: boolean; radiusMeters: number; focus?: MapFocus; onSelect: (id: string) => void; onDestination: (position: Coordinate) => void
}) {
  const mapRef = useRef<LeafletMap | null>(null)
  const [tileFailed, setTileFailed] = useState(false)
  const [tileRevision, setTileRevision] = useState(0)
  const [zoom, setZoom] = useState(14)
  const onReady = useMemo(() => (map: LeafletMap) => { mapRef.current = map }, [])
  const markerSize = Math.round(Math.min(32, Math.max(16, 30 * 2 ** ((zoom - 14) / 5))))
  const selfIcon = useMemo(() => icon('•', '#e0fff0', markerSize), [markerSize])
  const destinationIcon = useMemo(() => icon('D', '#efc779', markerSize, true), [markerSize])
  return <div className="wt-map-frame">
    <MapContainer center={tuple(position)} zoom={14} zoomControl={false} className="watchtower-map" attributionControl aria-label="Watchtower operations map">
      <TileLayer key={tileRevision} url={tileUrl} attribution={attribution} maxZoom={19}
        eventHandlers={{ tileerror: () => setTileFailed(true) }} />
      <MapEvents onDestination={onDestination} onReady={onReady} onZoom={setZoom} focus={focus} route={route} />
      {accuracy !== undefined && <Circle center={tuple(position)} radius={Math.min(accuracy, 10000)} interactive={false} pathOptions={{ color: '#d9fff0', weight: 1, fillOpacity: .06 }} />}
      {radar && <RadarOverlay position={position} radiusMeters={radiusMeters} />}
      {route && <Polyline positions={route.coordinates.map(tuple)} pathOptions={{ color: '#efc779', weight: 5, opacity: .9 }} />}
      <Marker position={tuple(position)} icon={selfIcon} title="Your position" alt="Your position"><Tooltip>Your position</Tooltip></Marker>
      {markers.map(marker => {
        const layer = LAYERS.find(layer => layer.id === marker.layer)!
        const stale = !!marker.observedAt && Date.now() - Date.parse(marker.observedAt) > 120_000
        return <Marker key={marker.id} position={tuple(marker.position)} icon={icon(layer.symbol, layer.color, markerSize, marker.id === selectedId, stale)}
          title={`${marker.label}${marker.simulated ? ' (sample)' : ''}`} alt={marker.label} bubblingMouseEvents={false}
          eventHandlers={{ click: () => onSelect(marker.id) }}>
          <Tooltip>{marker.label}{marker.simulated ? ' · sample' : stale ? ' · stale' : ''}</Tooltip>
        </Marker>
      })}
      {destination && <Marker position={tuple(destination.position)} icon={destinationIcon} title="Destination" alt="Destination" bubblingMouseEvents={false}>
        <Tooltip>{destination.label}</Tooltip>
      </Marker>}
    </MapContainer>
    <div className="wt-zoom" aria-label="Map zoom">
      <button type="button" aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()}>+</button>
      <button type="button" aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()}>−</button>
    </div>
    <div className="wt-map-caption">N ↑ <span>{radar ? 'Range rings · decorative sweep' : 'Tap the map to set a destination'}</span></div>
    {tileFailed && <div className="wt-tile-error" role="status">Some road tiles could not load. Markers remain available.
      <button type="button" onClick={() => { setTileFailed(false); setTileRevision(value => value + 1) }}>Retry map</button>
    </div>}
  </div>
}
