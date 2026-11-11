import { afterEach, describe, expect, it } from 'vitest';
import { chat, makeApp, type TestCtx } from './helpers';
import { parseSchedules } from '../src/modules/devices/vacuum-extras';

let ctx: TestCtx;
afterEach(async () => ctx?.app.close());

const P = 'xiaomi_us_1140903813_c102gl';

/** A “Rita” como a Xiaomi Home cria (nomes e valores do diagnóstico real do usuário). */
async function rita() {
  ctx = await makeApp();
  const now = new Date().toISOString();
  const ids: string[] = [];
  const add = (entity_id: string, state: string, attributes: Record<string, unknown> = {}) => {
    ctx.ha.states.set(entity_id, { entity_id, state, attributes, last_changed: now });
    ids.push(entity_id);
  };
  add(`vacuum.${P}`, 'docked', { friendly_name: 'Rita Rita', supported_features: 12312 });
  add(`sensor.${P}_battery_level_p_3_1`, '100', { friendly_name: 'Rita  Battery Battery Level', device_class: 'battery', unit_of_measurement: '%' });
  add(`sensor.${P}_charging_state_p_3_2`, 'Charging', { friendly_name: 'Rita  Battery Charging State' });
  add(`select.${P}_mode_p_2_3`, 'Full Speed', { friendly_name: 'Rita  Robot Cleaner Mode', options: ['Silent', 'Basic', 'Strong', 'Full Speed'] });
  add(`select.${P}_mop_mode_p_4_5`, 'Medium', { options: ['Low', 'Medium', 'High'] });
  add(`select.${P}_carpet_press_p_4_12`, 'Open', { options: ['Close', 'Open'] });
  add(`select.${P}_break_point_restart_p_4_11`, 'Open', { options: ['Close', 'Open'] });
  add(`select.${P}_child_lock_p_4_27`, 'Close', { options: ['Close', 'Open'] });
  add(`switch.${P}_enable_p_5_1`, 'on', { friendly_name: 'Rita * do-not-disturb enable' });
  add(`text.${P}_start_time_p_5_2`, '22:00');
  add(`text.${P}_end_time_p_5_3`, '08:00');
  add(`text.${P}_timer_clean_p_8_2`, '2-1-07:00-1111111-1-1-1-32-0;1-1-17:00-1111111-1-1-1-32-0');
  add(`button.${P}_start_mop_wash_a_2_6`, 'unknown');
  add(`button.${P}_start_dry_a_2_8`, 'unknown');
  add(`button.${P}_stop_dry_a_2_9`, 'unknown');
  add(`button.${P}_start_dust_arrest_a_2_4`, 'unknown');
  add(`button.${P}_start_eject_a_2_10`, 'unknown');
  add(`button.${P}_position_a_7_1`, 'unknown');
  add(`button.${P}_play_sound_a_7_2`, 'unknown');
  add(`button.${P}_reset_brush_life_a_9_1`, 'unknown');
  add(`button.${P}_reset_brush_life_a_10_1`, 'unknown');
  add(`button.${P}_reset_filter_life_a_11_1`, 'unknown');
  add(`button.${P}_reset_mop_life_a_18_1`, 'unknown');
  add(`sensor.${P}_brush_life_level_p_9_2`, '99');
  add(`sensor.${P}_brush_left_time_p_9_1`, '298', { unit_of_measurement: 'h' });
  add(`sensor.${P}_brush_life_level_p_10_2`, '66');
  add(`sensor.${P}_brush_left_time_p_10_1`, '132', { unit_of_measurement: 'h' });
  add(`sensor.${P}_filter_life_level_p_11_1`, '99');
  add(`sensor.${P}_filter_left_time_p_11_2`, '148', { unit_of_measurement: 'h' });
  add(`sensor.${P}_mop_life_level_p_18_1`, '60');
  add(`sensor.${P}_mop_left_time_p_18_2`, '48', { unit_of_measurement: 'h' });
  add(`sensor.${P}_dry_left_time_p_2_5`, '219', { unit_of_measurement: 'min' });
  add(`sensor.${P}_cleaning_area_p_4_3`, '3');
  add(`sensor.${P}_cleaning_time_p_4_2`, '2');
  add(`sensor.${P}_total_clean_area_p_12_4`, '61');
  add(`sensor.${P}_total_clean_time_p_12_2`, '87');
  add(`sensor.${P}_total_clean_times_p_12_3`, '4');
  add(`sensor.${P}_map_data_p_6_1`, 'eF49TkFq');
  ctx.app.services.devices.setRegistryProvider(async () => new Map(ids.map((id) => [id, { deviceId: 'dev-rita' }])));
  const list = (await ctx.inject('GET', '/api/devices?all=1')).json as any[];
  return list;
}

describe('Rita (Xiaomi Home, modelo c102gl)', () => {
  it('mostra um único aparelho “Rita” com todas as opções extras', async () => {
    const list = await rita();
    expect(list.filter((d) => d.entityId.includes(P)).map((d) => d.entityId)).toEqual([`vacuum.${P}`]);
    const r = list.find((d) => d.entityId === `vacuum.${P}`);
    expect(r.name).toBe('Rita');
    expect(r.vacuum).toMatchObject({ battery: 100, fanSpeed: 'Full Speed', fanSpeeds: ['Silent', 'Basic', 'Strong', 'Full Speed'], can: { locate: true, fanSpeed: true, pause: false } });
    const x = r.vacuum.extras;
    expect(x.controls.map((c: any) => c.key)).toEqual([
      'suction', 'water', 'dnd', 'carpet', 'resume', 'child_lock', 'mop_wash', 'dry_start', 'dry_stop', 'dust', 'locate',
      'reset_main_brush', 'reset_side_brush', 'reset_filter', 'reset_mop',
    ]);
    expect(x.controls.find((c: any) => c.key === 'suction').options.map((o: any) => o.label)).toEqual(['Silenciosa', 'Básica', 'Forte', 'Máxima']);
    expect(x.controls.find((c: any) => c.key === 'dnd')).toMatchObject({ value: true, hint: 'das 22:00 às 08:00' });
    expect(x.controls.find((c: any) => c.key === 'child_lock').value).toBe(false);
    expect(x.consumables).toEqual([
      { key: 'main_brush', label: 'Escova principal', percent: 99, hoursLeft: 298, resetId: `button.${P}_reset_brush_life_a_9_1` },
      { key: 'side_brush', label: 'Escova lateral', percent: 66, hoursLeft: 132, resetId: `button.${P}_reset_brush_life_a_10_1` },
      { key: 'filter', label: 'Filtro', percent: 99, hoursLeft: 148, resetId: `button.${P}_reset_filter_life_a_11_1` },
      { key: 'mop', label: 'Pano', percent: 60, hoursLeft: 48, resetId: `button.${P}_reset_mop_life_a_18_1` },
    ]);
    expect(x.stats).toEqual({ lastArea: 3, lastMinutes: 2, totalArea: 61, totalCount: 4, totalMinutes: 87 });
    expect(x).toMatchObject({ dryingMinutes: 219, charging: 'Carregando', schedules: ['07:00 todos os dias', '17:00 todos os dias'] });
  });

  it('executa só os controles listados para o robô', async () => {
    await rita();
    const url = `/api/devices/vacuum.${P}/vacuum/extra`;
    let r = await ctx.inject('POST', url, { id: `button.${P}_start_mop_wash_a_2_6` });
    expect(r.status).toBe(200);
    expect(ctx.ha.calls.at(-1)).toMatchObject({ domain: 'button', service: 'press', data: { entity_id: `button.${P}_start_mop_wash_a_2_6` } });
    r = await ctx.inject('POST', url, { id: `select.${P}_mop_mode_p_4_5`, value: 'Alta' });
    expect(ctx.ha.calls.at(-1)).toMatchObject({ domain: 'select', service: 'select_option', data: { option: 'High' } });
    expect(r.json.vacuum.extras.controls.find((c: any) => c.key === 'water').value).toBe('High');
    r = await ctx.inject('POST', url, { id: `select.${P}_child_lock_p_4_27`, value: true });
    expect(ctx.ha.calls.at(-1)).toMatchObject({ domain: 'select', service: 'select_option', data: { option: 'Open' } });
    await ctx.inject('POST', url, { id: `switch.${P}_enable_p_5_1`, value: false });
    expect(ctx.ha.calls.at(-1)).toMatchObject({ domain: 'switch', service: 'turn_off' });
    // Fora da lista: botão “eject” (desconhecido), luz da casa, opção inválida
    const calls = ctx.ha.calls.length;
    expect((await ctx.inject('POST', url, { id: `button.${P}_start_eject_a_2_10` })).status).toBe(400);
    expect((await ctx.inject('POST', url, { id: 'light.luz_da_sala' })).status).toBe(400);
    expect((await ctx.inject('POST', url, { id: `select.${P}_mode_p_2_3`, value: 'Foguete' })).status).toBe(400);
    expect(ctx.ha.calls.length).toBe(calls);
  });

  it('localizar e potência usam as entidades da Xiaomi Home; nome sem repetição na voz', async () => {
    await rita();
    await ctx.inject('POST', `/api/devices/vacuum.${P}/vacuum`, { command: 'locate' });
    expect(ctx.ha.calls.at(-1)).toMatchObject({ domain: 'button', service: 'press', data: { entity_id: `button.${P}_position_a_7_1` } });
    const fan = await ctx.inject('POST', `/api/devices/vacuum.${P}/vacuum`, { command: 'set_fan_speed', fanSpeed: 'Silent' });
    expect(ctx.ha.calls.at(-1)).toMatchObject({ domain: 'select', service: 'select_option', data: { option: 'Silent' } });
    expect(fan.json.vacuum.fanSpeed).toBe('Silent');
    await ctx.inject('PATCH', `/api/devices/vacuum.${P}`, { aiAllowed: true });
    const r = await chat(ctx, 'Luna, aspira a casa');
    expect(r.reply).toMatch(/Rita começou a aspirar/);
  });

  it('guarda a foto do robô (só JPEG, só aspirador)', async () => {
    await rita();
    const send = (url: string, body: Buffer, type = 'image/jpeg') => {
      const b = '----dia';
      const payload = Buffer.concat([
        Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="photo"; filename="rita.jpg"\r\nContent-Type: ${type}\r\n\r\n`),
        body,
        Buffer.from(`\r\n--${b}--\r\n`),
      ]);
      return ctx.app.inject({ method: 'POST', url, payload, headers: { cookie: ctx.cookies, 'x-csrf-token': ctx.csrf, 'content-type': `multipart/form-data; boundary=${b}` } });
    };
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]);
    const up = await send(`/api/devices/vacuum.${P}/photo`, jpeg);
    expect(up.statusCode).toBe(200);
    expect(typeof up.json().vacuum.photo).toBe('number');
    const got = await ctx.app.inject({ method: 'GET', url: `/api/devices/vacuum.${P}/photo`, headers: { cookie: ctx.cookies } });
    expect(got.headers['content-type']).toBe('image/jpeg');
    expect(got.rawPayload.length).toBe(jpeg.length);
    expect((await send(`/api/devices/vacuum.${P}/photo`, Buffer.alloc(2000, 1), 'image/png')).statusCode).toBe(400);
    expect((await send('/api/devices/light.luz_da_sala/photo', jpeg)).statusCode).toBe(400);
    const del = await ctx.inject('DELETE', `/api/devices/vacuum.${P}/photo`);
    expect(del.json.vacuum.photo).toBeNull();
  });

  it('entende os agendamentos da Xiaomi', () => {
    expect(parseSchedules('2-1-07:00-1111111-1-1-1-32-0;1-0-17:00-1111111-1-1-1-32-0;3-1-09:30-0111110-1')).toEqual(['07:00 todos os dias', '09:30 em 5 dias da semana']);
    expect(parseSchedules('lixo')).toEqual([]);
  });
});
