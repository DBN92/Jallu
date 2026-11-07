import { beforeEach, describe, expect, it } from 'vitest';
import type { DeviceDto, VacuumInfo } from '@luna/shared';
import { useVacuumShow } from './VacuumCelebration';

const robot = (phase: VacuumInfo['phase'], entityId = 'vacuum.robo_xiaomi', name = 'Robô Xiaomi'): DeviceDto =>
  ({
    entityId,
    name,
    domain: 'vacuum',
    vacuum: { phase, status: '', battery: 80, fanSpeed: 'Standard', fanSpeeds: [], can: { pause: true, stop: true, locate: true, fanSpeed: true, returnHome: true }, error: null },
  }) as unknown as DeviceDto;

describe('animação do aspirador', () => {
  beforeEach(() => useVacuumShow.setState({ queue: [], last: {} }));

  it('mostra “começou” ao sair da base e “terminou” ao voltar para ela', () => {
    const s = useVacuumShow.getState();
    s.seed([robot('docked')]);
    s.observe(robot('cleaning'));
    expect(useVacuumShow.getState().queue.map((q) => q.mode)).toEqual(['start']);
    s.observe(robot('returning'));
    s.observe(robot('docked'));
    expect(useVacuumShow.getState().queue.map((q) => q.mode)).toEqual(['start', 'end']);
  });

  it('não repete ao continuar depois de pausar nem sem saber o estado anterior', () => {
    const s = useVacuumShow.getState();
    s.observe(robot('cleaning')); // primeira notícia, sem estado anterior
    s.observe(robot('paused'));
    s.observe(robot('cleaning')); // só continuou
    s.observe(robot('cleaning')); // mesma fase
    expect(useVacuumShow.getState().queue).toHaveLength(0);
  });

  it('enfileira os dois robôs e ignora outros aparelhos', () => {
    const s = useVacuumShow.getState();
    s.seed([robot('docked'), robot('docked', 'vacuum.neatsvor', 'Neatsvor')]);
    s.observe(robot('cleaning'));
    s.observe(robot('cleaning', 'vacuum.neatsvor', 'Neatsvor'));
    s.observe({ entityId: 'light.sala', name: 'Luz', vacuum: null } as unknown as DeviceDto);
    expect(useVacuumShow.getState().queue.map((q) => q.name)).toEqual(['Robô Xiaomi', 'Neatsvor']);
    s.done();
    expect(useVacuumShow.getState().queue.map((q) => q.name)).toEqual(['Neatsvor']);
  });
});
