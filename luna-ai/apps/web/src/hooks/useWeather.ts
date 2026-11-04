import { useCallback, useEffect, useState } from 'react';
import type { WeatherDto } from '@luna/shared';
import { api, errorMessage } from '../services/api';
import { useLocation } from '../stores/location';
import { useSettings } from '../stores/settings';

/** Clima para a localização atual (GPS autorizado) ou de casa. */
export function useWeather(source: 'auto' | 'gps' | 'home' = 'auto') {
  const useGps = useSettings((s) => s.useGps);
  const home = useSettings((s) => s.settings?.homeLocation ?? null);
  const settingsLoaded = useSettings((s) => s.settings !== null);
  const [data, setData] = useState<WeatherDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let qs = '';
      if (source === 'gps' || (source === 'auto' && useGps)) {
        const c = await useLocation.getState().request();
        if (c) qs = `?latitude=${c.latitude.toFixed(4)}&longitude=${c.longitude.toFixed(4)}`;
        else if (!home) throw new Error(useLocation.getState().message ?? 'Localização indisponível.');
      } else if (!home) {
        setData(null);
        return;
      }
      setData(await api<WeatherDto>(`/api/weather${qs}`));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [source, useGps, home]);

  useEffect(() => {
    if (settingsLoaded) void load();
  }, [load, settingsLoaded]);

  return { data, error, loading, reload: load, hasSource: useGps || !!home };
}

export function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return now;
}
