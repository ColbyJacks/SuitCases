import { MapPin, Navigation, X } from 'lucide-react'
import { distanceMiles, type Coordinate } from '../radar/radarEngine'
import type { WatchtowerMarker } from './types'

export function relativeTime(timestamp?: string) {
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) return 'Time not provided'
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(timestamp)) / 1000))
  return seconds < 60 ? `${seconds}s ago` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ago` : `${Math.floor(seconds / 3600)}h ago`
}

export function MarkerDetails({ marker, position, onClose, onDestination, onFocus }: {
  marker: WatchtowerMarker; position: Coordinate; onClose: () => void; onDestination: () => void; onFocus: () => void
}) {
  return <section className="wt-details" aria-label="Selected marker details">
    <div className="wt-section-heading"><span>{marker.simulated ? 'Sample marker' : marker.layer}</span><button type="button" aria-label="Close marker details" onClick={onClose}><X size={16} /></button></div>
    <h3>{marker.label}</h3>
    {marker.status && <span className="wt-badge">{marker.status}</span>}
    {marker.description && <p>{marker.description}</p>}
    <dl><div><dt>Distance</dt><dd>{distanceMiles(position, marker.position).toFixed(1)} mi · straight line</dd></div>
      <div><dt>Source</dt><dd>{marker.source}</dd></div>
      {!marker.simulated && <div><dt>Position updated</dt><dd>{relativeTime(marker.observedAt)}</dd></div>}
      {marker.accuracyMeters !== undefined && <div><dt>Accuracy</dt><dd>±{Math.round(marker.accuracyMeters)} m</dd></div>}
    </dl>
    <div className="wt-button-row"><button type="button" className="wt-button" onClick={onFocus}><MapPin size={15} /> Locate</button>
      <button type="button" className="wt-button wt-primary" onClick={onDestination}><Navigation size={15} /> Set destination</button></div>
  </section>
}
