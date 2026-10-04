export type Coordinate = { latitude: number; longitude: number }

export type Station = Coordinate & { id: string; name: string; area: string }

/**
 * Deliberately small, bundled demo reference deck. Replace this with the City
 * ArcGIS station layer before calling the panel a production data source.
 */
export const DEMO_STATIONS: Station[] = [
  { id: 'central', name: 'Central Substation', area: 'CENTRAL', latitude: 29.444, longitude: -98.497 },
  { id: 'downtown', name: 'Downtown Station', area: 'DOWNTOWN', latitude: 29.4247, longitude: -98.4931 },
  { id: 'east', name: 'East Substation', area: 'EAST', latitude: 29.4413, longitude: -98.3996 },
  { id: 'north', name: 'North Substation', area: 'NORTH', latitude: 29.5503, longitude: -98.4768 },
  { id: 'prue', name: 'Prue Road Substation', area: 'PRUE', latitude: 29.5393, longitude: -98.5941 },
  { id: 'south', name: 'South Substation', area: 'SOUTH', latitude: 29.3451, longitude: -98.5103 },
  { id: 'west', name: 'West Substation', area: 'WEST', latitude: 29.4338, longitude: -98.5475 },
]

const RADIUS_MILES = 3958.7613
const toRadians = (degrees: number) => (degrees * Math.PI) / 180

export function distanceMiles(from: Coordinate, to: Coordinate) {
  const dLat = toRadians(to.latitude - from.latitude)
  const dLon = toRadians(to.longitude - from.longitude)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLon / 2) ** 2
  return RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Compass bearing: 0° north, 90° east. */
export function bearingDegrees(from: Coordinate, to: Coordinate) {
  const lonDelta = toRadians(to.longitude - from.longitude)
  const y = Math.sin(lonDelta) * Math.cos(toRadians(to.latitude))
  const x = Math.cos(toRadians(from.latitude)) * Math.sin(toRadians(to.latitude)) - Math.sin(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.cos(lonDelta)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

export function compassDirection(bearing: number) {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(bearing / 45) % 8]
}

export type NearbyStation = Station & { miles: number; bearing: number }

export function nearbyStations(location: Coordinate) {
  return DEMO_STATIONS.map((station) => ({ ...station, miles: distanceMiles(location, station), bearing: bearingDegrees(location, station) })).sort((a, b) => a.miles - b.miles)
}


export type Priority = 'Priority 1' | 'Priority 2' | 'Priority 3'

const BASELINE_MINUTES: Record<Priority, number> = { 'Priority 1': 8, 'Priority 2': 15, 'Priority 3': 29 }

/** Prototype display model: a historical baseline with a deliberately small proximity adjustment. */
export function estimatedResponse(priority: Priority, nearestMiles: number) {
  const minutes = BASELINE_MINUTES[priority] + Math.min(4, nearestMiles * 0.45)
  return { low: Math.max(1, Math.round(minutes - 2)), high: Math.round(minutes + 3) }
}

