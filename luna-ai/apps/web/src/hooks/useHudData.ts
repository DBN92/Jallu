import { useEffect, useState } from 'react';
import type { AutomationRuleDto, HealthDto } from '@luna/shared/types';
import { api } from '../services/api';

/** Diagnóstico do servidor (atualiza a cada 30 s). */
export function useHealth() {
  const [health, setHealth] = useState<HealthDto | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => api<HealthDto>('/api/health/details').then((h) => alive && setHealth(h)).catch(() => undefined);
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return health;
}

/** Automações reais (atualiza a cada 2 min). */
export function useAutomations() {
  const [rules, setRules] = useState<AutomationRuleDto[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => api<AutomationRuleDto[]>('/api/automations').then((r) => alive && setRules(r)).catch(() => alive && setRules([]));
    void load();
    const t = setInterval(load, 120_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return rules;
}
