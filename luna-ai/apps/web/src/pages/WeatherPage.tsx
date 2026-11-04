import { Droplets, MapPin, RefreshCw, Sunrise, Sunset, Thermometer, Umbrella, Wind } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Page } from '../components/Layout';
import { WeatherIcon } from '../components/WeatherIcon';
import { Banner, Button, Card, PageHeader, Spinner } from '../components/ui';
import { useWeather } from '../hooks/useWeather';
import { useSettings } from '../stores/settings';

const hhmm = (iso: string) => iso.slice(11, 16);

export default function WeatherPage() {
  const { data, error, loading, reload, hasSource } = useWeather('auto');
  const { useGps, setUseGps } = useSettings();
  const home = useSettings((s) => s.settings?.homeLocation);

  return (
    <Page>
      <PageHeader
        title="Clima"
        subtitle={data ? `${data.location.name ?? (useGps ? 'Sua localização atual' : 'Casa')}${data.cached ? ' · em cache' : ''}` : 'Previsão via Open-Meteo'}
        action={
          <button onClick={() => void reload()} className="glass rounded-full p-2 text-white/70" aria-label="Atualizar">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        }
      />
      {error && <Banner>{error}</Banner>}
      {!hasSource && (
        <Card className="mb-4 space-y-3 text-sm text-white/70">
          <p>Para ver a previsão, permita a localização deste aparelho ou defina a localização de casa.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setUseGps(true)}>
              <MapPin className="h-4 w-4" /> Usar minha localização
            </Button>
            <Link to="/configuracoes">
              <Button variant="ghost">Definir casa</Button>
            </Link>
          </div>
          <p className="text-xs text-white/40">As coordenadas do GPS não são salvas: são usadas apenas na consulta.</p>
        </Card>
      )}
      {hasSource && (
        <div className="mb-4 flex gap-2 text-xs">
          <button onClick={() => setUseGps(true)} className={`rounded-full px-3 py-1.5 ${useGps ? 'bg-white text-ink-950' : 'glass text-white/70'}`}>
            Localização atual
          </button>
          <button disabled={!home} onClick={() => setUseGps(false)} className={`rounded-full px-3 py-1.5 disabled:opacity-40 ${!useGps ? 'bg-white text-ink-950' : 'glass text-white/70'}`}>
            Casa{home ? ` (${home.name.split(',')[0]})` : ''}
          </button>
        </div>
      )}
      {loading && !data && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}
      {data && (
        <>
          <Card className="mb-4">
            <div className="flex items-center gap-4">
              <WeatherIcon code={data.current.weatherCode} isDay={data.current.isDay} className="h-16 w-16" />
              <div>
                <p className="text-5xl font-light tabular-nums">{Math.round(data.current.temperature)}°</p>
                <p className="text-white/70">{data.current.condition}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div className="flex items-center gap-2 text-white/70"><Thermometer className="h-4 w-4 text-violet-300" /> Sensação {Math.round(data.current.apparentTemperature)}°</div>
              <div className="flex items-center gap-2 text-white/70"><Droplets className="h-4 w-4 text-cyan-300" /> Umidade {data.current.humidity}%</div>
              <div className="flex items-center gap-2 text-white/70"><Wind className="h-4 w-4 text-blue-300" /> Vento {Math.round(data.current.windSpeed)} km/h</div>
              <div className="flex items-center gap-2 text-white/70"><Umbrella className="h-4 w-4 text-sky-300" /> Chuva hoje {data.daily[0]?.precipitationProbability ?? 0}%</div>
            </div>
            {data.daily[0] && (
              <div className="mt-3 flex gap-4 text-xs text-white/50">
                <span className="flex items-center gap-1"><Sunrise className="h-3.5 w-3.5" /> {hhmm(data.daily[0].sunrise)}</span>
                <span className="flex items-center gap-1"><Sunset className="h-3.5 w-3.5" /> {hhmm(data.daily[0].sunset)}</span>
              </div>
            )}
          </Card>

          <h2 className="mb-2 text-xs font-medium tracking-wider text-white/40 uppercase">Próximas horas</h2>
          <div className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1">
            {data.hourly.map((h) => (
              <div key={h.time} className="glass flex w-16 shrink-0 flex-col items-center gap-1 rounded-2xl py-3 text-xs">
                <span className="text-white/50">{hhmm(h.time)}</span>
                <WeatherIcon code={h.weatherCode} className="h-5 w-5" />
                <span className="font-medium">{Math.round(h.temperature)}°</span>
                <span className={`text-[10px] ${h.precipitationProbability >= 40 ? 'text-sky-300' : 'text-white/35'}`}>{h.precipitationProbability}%</span>
              </div>
            ))}
          </div>

          <h2 className="mb-2 text-xs font-medium tracking-wider text-white/40 uppercase">7 dias</h2>
          <Card className="divide-y divide-white/5 p-0">
            {data.daily.map((d, i) => (
              <div key={d.date} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="w-20 capitalize text-white/70">{i === 0 ? 'Hoje' : new Date(`${d.date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric' })}</span>
                <WeatherIcon code={d.weatherCode} className="h-5 w-5" />
                <span className="flex-1 truncate text-white/50"><span className="hidden sm:inline">{d.condition}</span></span>
                <span className={`w-10 text-right text-xs ${d.precipitationProbability >= 40 ? 'text-sky-300' : 'text-white/35'}`}>{d.precipitationProbability}%</span>
                <span className="w-16 text-right tabular-nums">
                  <span className="text-white/40">{Math.round(d.min)}°</span> {Math.round(d.max)}°
                </span>
              </div>
            ))}
          </Card>
          <p className="mt-3 text-center text-[11px] text-white/30">Dados: Open-Meteo · atualizado {new Date(data.fetchedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
        </>
      )}
    </Page>
  );
}
