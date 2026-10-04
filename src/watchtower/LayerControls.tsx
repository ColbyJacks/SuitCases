import { Layers, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { LAYERS, type LayerId, type LayerState } from './types'

export function LayerControls({ enabled, states, samples, onToggle, onSamples, onRefresh }: {
  enabled: Record<LayerId, boolean>; states: Record<LayerId, LayerState>; samples: boolean
  onToggle: (layer: LayerId) => void; onSamples: (value: boolean) => void; onRefresh: () => void
}) {
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 701px)').matches)
  return <details className="wt-layers" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><Layers size={16} /> Layers <span>{Object.values(enabled).filter(Boolean).length} enabled</span></summary>
    <div className="wt-layer-content">
      <div className="wt-layer-grid">{LAYERS.map(layer => <label key={layer.id} className={`wt-layer ${enabled[layer.id] ? 'is-enabled' : ''}`}>
        <input type="checkbox" checked={enabled[layer.id]} onChange={() => onToggle(layer.id)} />
        <span className="wt-layer-symbol" style={{ color: layer.color }}>{layer.symbol}</span>
        <span>{layer.label}<small>{enabled[layer.id] ? states[layer.id].status : 'Hidden'}</small></span>
      </label>)}</div>
      <div className="wt-layer-footer">
        <label><input type="checkbox" checked={samples} onChange={event => onSamples(event.target.checked)} /> Sample markers</label>
        <button type="button" onClick={onRefresh} aria-label="Refresh enabled layers"><RefreshCw size={14} /> Refresh</button>
      </div>
      {samples && <p className="wt-muted">Crew, assets, objectives and traffic use a fictional San Antonio scenario.</p>}
      {!samples && <p className="wt-muted">Crew and asset positions require a connected operations service.</p>}
      {LAYERS.filter(layer => enabled[layer.id] && states[layer.id].error).map(layer => <p key={layer.id} className="wt-layer-error" role="status">{layer.label}: {states[layer.id].error}</p>)}
      {enabled.places && <p className="wt-muted">Hospitals, fuel and parking near your position · up to 3 km.</p>}
      {enabled.places && states.places.status === 'ready' && states.places.data?.markers.length === 0 && <p className="wt-muted" role="status">No nearby places found in this area.</p>}
    </div>
  </details>
}
