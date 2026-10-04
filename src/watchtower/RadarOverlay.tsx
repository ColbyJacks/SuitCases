import { useState } from 'react'
import { Circle, Pane, useMap, useMapEvents } from 'react-leaflet'
import type { Coordinate } from '../radar/radarEngine'

export function RadarOverlay({ position, radiusMeters }: { position: Coordinate; radiusMeters: number }) {
  const map = useMap()
  const [, update] = useState(0)
  useMapEvents({ move: () => update(value => value + 1), zoom: () => update(value => value + 1), resize: () => update(value => value + 1) })
  const origin: [number, number] = [position.latitude, position.longitude]
  const center = map.latLngToLayerPoint(origin)
  const north = map.latLngToLayerPoint([Math.min(85, position.latitude + radiusMeters / 111_320), position.longitude])
  const radius = Math.min(2500, Math.abs(center.y - north.y))
  return <>
    {[1 / 3, 2 / 3, 1].map(fraction => <Circle key={fraction} center={origin} radius={radiusMeters * fraction}
      interactive={false} pathOptions={{ color: '#70e6b6', weight: 1, opacity: .35, fillOpacity: 0, dashArray: fraction === 1 ? '5 7' : undefined }} />)}
    <Pane name="watchtower-sweep" style={{ zIndex: 410, pointerEvents: 'none' }}>
      <div aria-hidden="true" className="wt-radar-sweep" style={{ width: radius * 2, height: radius * 2, left: center.x - radius, top: center.y - radius }} />
    </Pane>
  </>
}
