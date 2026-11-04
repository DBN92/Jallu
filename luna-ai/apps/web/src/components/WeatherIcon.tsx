import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Moon, Sun } from 'lucide-react';

export function WeatherIcon({ code, isDay = true, className = 'h-6 w-6' }: { code: number; isDay?: boolean; className?: string }) {
  if (code === 0) return isDay ? <Sun className={`${className} text-amber-300`} /> : <Moon className={`${className} text-indigo-200`} />;
  if (code <= 2) return isDay ? <CloudSun className={`${className} text-amber-200`} /> : <CloudMoon className={`${className} text-indigo-200`} />;
  if (code === 3) return <Cloud className={`${className} text-slate-300`} />;
  if (code <= 48) return <CloudFog className={`${className} text-slate-300`} />;
  if (code <= 57) return <CloudDrizzle className={`${className} text-sky-300`} />;
  if (code <= 67 || (code >= 80 && code <= 82)) return <CloudRain className={`${className} text-sky-400`} />;
  if (code <= 86) return <CloudSnow className={`${className} text-white`} />;
  return <CloudLightning className={`${className} text-yellow-300`} />;
}
