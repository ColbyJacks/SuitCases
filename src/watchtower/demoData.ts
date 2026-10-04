import type { LayerPayload, MarkerLayer, WatchtowerMarker } from './types'

// Fictional examples remain anchored in San Antonio. They never impersonate a live feed.
const markers: WatchtowerMarker[] = [
  { id: 'sample-crew-1', layer: 'crew', label: 'Echo', position: { latitude: 29.4257, longitude: -98.4902 }, description: 'Sample crew member at a meeting point.', status: 'Ready', source: 'Sample scenario', simulated: true },
  { id: 'sample-crew-2', layer: 'crew', label: 'Atlas', position: { latitude: 29.4207, longitude: -98.4893 }, description: 'Sample crew member checking equipment.', status: 'Checking in', source: 'Sample scenario', simulated: true },
  { id: 'sample-asset-1', layer: 'vehicles', label: 'Crew van', position: { latitude: 29.4278, longitude: -98.4965 }, description: 'Fictional vehicle marker. Connect a tracker to receive actual positions.', status: 'Parked', source: 'Sample scenario', simulated: true },
  { id: 'sample-objective-1', layer: 'objectives', label: 'Rendezvous', position: { latitude: 29.4284, longitude: -98.4892 }, description: 'Sample meeting point. You can use it as a route destination.', status: 'Pending', source: 'Sample scenario', simulated: true },
  { id: 'sample-objective-2', layer: 'objectives', label: 'Equipment check', position: { latitude: 29.4189, longitude: -98.4964 }, description: 'Fictional checkpoint for the sample operation.', status: 'Complete', source: 'Sample scenario', simulated: true },
  { id: 'sample-traffic-1', layer: 'traffic', label: 'Sample roadworks', position: { latitude: 29.423, longitude: -98.4862 }, description: 'Illustrative traffic marker, not an actual road closure. It does not affect routing.', status: 'Sample only', source: 'Sample scenario', simulated: true },
]

export function sampleLayer(layer: MarkerLayer): LayerPayload {
  return { markers: markers.filter(marker => marker.layer === layer), fetchedAt: new Date().toISOString() }
}
