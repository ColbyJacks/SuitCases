import { RefreshCw, Wind } from 'lucide-react'
import type { WeatherState } from './types'
import { relativeTime } from './MarkerDetails'
import { weatherCondition } from './weather'

export function WeatherCard({ weather, demo, onRefresh }: { weather: WeatherState; demo: boolean; onRefresh: () => void }) {
  const title = `Weather at ${demo ? 'demo' : 'your'} position`
  const reading = (value: number | null) => value === null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 1 })
  return <section className="wt-weather" aria-label={title} aria-busy={weather.status === 'loading'}>
    <div className="wt-section-heading"><span>{title}</span><Wind size={15} /></div>
    <div aria-live="polite">
      {weather.data ? <>
        <p className="wt-weather-condition">{weatherCondition(weather.data.weatherCode)}</p>
        <div className="wt-weather-reading"><strong>{weather.data.temperatureC === null ? '—' : `${Math.round(weather.data.temperatureC)}°C`}</strong>
          <span>Wind {reading(weather.data.windKmh)} km/h<br />Precipitation {reading(weather.data.precipitationMm)} mm</span></div>
        <p className="wt-muted" title={`Conditions: ${weather.data.observedAt}. Fetched: ${weather.data.fetchedAt}.`}>
          {weather.data.source === 'Open-Meteo' ? <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> : weather.data.source}
          {' · model conditions '}{relativeTime(weather.data.observedAt)}
        </p>
        <p className="wt-muted">{weather.status === 'loading' ? 'Updating conditions…'
          : weather.status === 'stale' ? 'Last available conditions · refresh needed'
            : `Fetched ${relativeTime(weather.data.fetchedAt)} · refreshes every 5 min`}</p>
      </> : <p className="wt-muted">{weather.status === 'loading' ? 'Loading conditions…' : 'No weather available.'}</p>}
      {weather.error && <p className="wt-layer-error" role="alert">{weather.error}</p>}
    </div>
    <button type="button" className="wt-button" aria-label="Refresh weather" disabled={weather.status === 'loading'} onClick={onRefresh}>
      <RefreshCw size={14} /> {weather.status === 'loading' ? 'Updating…' : weather.error ? 'Retry weather' : 'Refresh weather'}
    </button>
  </section>
}
