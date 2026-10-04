import type { Coordinate } from './radarEngine'

export type RoadRoute = {
  coordinates: Coordinate[]
  distanceMeters: number
  durationSeconds: number
}

type OsrmRouteResponse = {
  code: string
  routes?: Array<{
    distance: number
    duration: number
    geometry: { coordinates: [number, number][] }
  }>
  message?: string
}

/**
 * Requests a conventional driving route. This deliberately does not use
 * police, crime, incident, or avoidance criteria.
 */
export async function requestRoadRoute(start: Coordinate, destination: Coordinate, signal?: AbortSignal): Promise<RoadRoute> {
  const coordinates = `${start.longitude},${start.latitude};${destination.longitude},${destination.latitude}`
  const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`
  const response = await fetch(url, { signal })

  if (!response.ok) throw new Error('Route service is unavailable. Try again in a moment.')

  const data = (await response.json()) as OsrmRouteResponse
  const route = data.routes?.[0]
  if (data.code !== 'Ok' || !route) throw new Error(data.message ?? 'No drivable route was found for that destination.')

  return {
    coordinates: route.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })),
    distanceMeters: route.distance,
    durationSeconds: route.duration,
  }
}

export function formatRouteDistance(meters: number) {
  const miles = meters / 1609.344
  return miles < 0.1 ? `${Math.round(meters)} m` : `${miles.toFixed(miles < 10 ? 1 : 0)} mi`
}

export function formatRouteDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60))
  return minutes >= 60 ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min` : `${minutes} min`
}
