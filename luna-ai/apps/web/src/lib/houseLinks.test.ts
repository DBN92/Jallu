import { describe, expect, it } from 'vitest';
import type { DeviceDto } from '@luna/shared';
import { resolveHouseLinks } from './houseLinks';

const dev = (entityId: string, name: string, extra: Partial<DeviceDto> = {}) => ({ entityId, domain: entityId.split('.')[0], name, controllable: true, ...extra }) as DeviceDto;

describe('vínculos da maquete 3D', () => {
  const devices = [dev('light.abajures', 'Cabeceira'), dev('light.fita', 'LED Luíza'), dev('fan.suite', 'Ventilador'), dev('sensor.x', 'Luminária', { controllable: false }), dev('light.g1', 'Luz da Garagem'), dev('switch.g2', 'Luz da garagem')];

  it('sem escolha salva, usa o aparelho de mesmo nome (sem acento/maiúsculas) e do tipo certo', () => {
    const r = resolveHouseLinks({}, devices);
    expect(r.cabeceira).toMatchObject({ device: { entityId: 'light.abajures' }, auto: true });
    expect(r['led-luiza']?.device.entityId).toBe('light.fita');
    expect(r.ventilador?.device.entityId).toBe('fan.suite');
    expect(r.luminaria).toBeUndefined(); // sensor não é controlável
    expect(r['luz-garagem']).toBeUndefined(); // dois com o mesmo nome: não adivinha
  });

  it('a escolha do administrador vale mais; null desliga o automático; entidade sumida não vincula', () => {
    const r = resolveHouseLinks({ 'luz-garagem': 'switch.g2', cabeceira: null, ventilador: 'fan.nao_existe' }, devices);
    expect(r['luz-garagem']).toMatchObject({ device: { entityId: 'switch.g2' }, auto: false });
    expect(r.cabeceira).toBeUndefined();
    expect(r.ventilador).toBeUndefined();
  });
});
