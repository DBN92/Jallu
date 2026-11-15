import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join, resolve } from 'node:path';
import { PROJECT_ROOT } from '../../config/env';

/**
 * go2rtc (programa livre, um único arquivo) como “tradutor” local: busca o vídeo WebRTC das câmeras
 * Smart Life pela nuvem Tuya — o mesmo jeito do site/app — e entrega em RTSP só em 127.0.0.1, onde o
 * ffmpeg da Luna lê como qualquer câmera direta. Sem painel web, sem portas abertas para a rede,
 * sem descoberta na rede (mDNS/HomeKit desligados). Instalado por scripts/go2rtc-setup.sh.
 */
export class Go2rtc {
  private proc: ChildProcess | null = null;
  private streams = new Map<string, string>();
  private written = '';
  private log: string[] = [];

  constructor(
    private readonly setting: string,
    private readonly dataDir: string,
    private readonly port = 18554,
  ) {}

  path(): string | null {
    if (this.setting) return existsSync(this.setting) ? this.setting : null;
    const local = resolve(PROJECT_ROOT, 'runtime', 'go2rtc', 'go2rtc');
    if (existsSync(local)) return local;
    for (const dir of (process.env.PATH ?? '').split(':')) if (dir && existsSync(join(dir, 'go2rtc'))) return join(dir, 'go2rtc');
    return null;
  }

  get available() {
    return this.path() !== null;
  }

  /** Últimas mensagens do go2rtc (para o diagnóstico) */
  recentLog() {
    return this.log.slice(-6);
  }

  /** O motivo mais recente de erro do go2rtc (para mostrar no Testar) */
  lastError(): string | null {
    const l = [...this.log].reverse().find((x) => /err|fail/i.test(x));
    if (!l) return null;
    const m = l.match(/error="?([^"]+)"?/i);
    return (m ? m[1]! : l).slice(0, 240);
  }

  /** Configuração: só RTSP local; API, WebRTC servidor, SRTP, RTMP e HomeKit desligados */
  private config() {
    return JSON.stringify({
      api: { listen: '' },
      rtsp: { listen: `127.0.0.1:${this.port}` },
      webrtc: { listen: '' },
      srtp: { listen: '' },
      rtmp: { listen: '' },
      log: { level: 'info' },
      streams: Object.fromEntries([...this.streams].map(([k, v]) => [k, [v]])),
    });
  }

  /** Garante a fonte configurada e o go2rtc rodando; devolve o endereço RTSP local da câmera */
  async streamUrl(name: string, source: string): Promise<string> {
    const bin = this.path();
    if (!bin) throw new Error('go2rtc não está instalado no servidor. Rode: sudo bash scripts/go2rtc-setup.sh');
    if (!/^[a-z0-9_]+$/.test(name)) throw new Error('Nome de câmera inválido.');
    this.streams.set(name, source);
    const cfg = this.config();
    if (cfg !== this.written || !this.proc || this.proc.exitCode !== null) {
      mkdirSync(this.dataDir, { recursive: true });
      const file = join(this.dataDir, 'go2rtc.json');
      writeFileSync(file, cfg, { mode: 0o600 }); // tem a chave da nuvem Tuya: só o dono lê
      this.written = cfg;
      await this.restart(bin, file);
    }
    return `rtsp://127.0.0.1:${this.port}/${name}`;
  }

  private async restart(bin: string, file: string) {
    if (this.proc && this.proc.exitCode === null) {
      const old = this.proc;
      await new Promise<void>((done) => {
        old.once('close', () => done());
        old.kill();
        setTimeout(done, 3000);
      });
    }
    const proc = spawn(bin, ['-config', file], { stdio: ['ignore', 'pipe', 'pipe'] });
    // A Luna encerrou de repente: o go2rtc vai junto
    const onExit = () => proc.kill();
    process.once('exit', onExit);
    proc.once('close', () => process.removeListener('exit', onExit));
    const keep = (d: Buffer) => {
      const lines = d
        .toString()
        .replace(/(client_secret|password|access_token|token)=[^&\s"]+/gi, '$1=…')
        .replace(/\x1b\[[0-9;]*m/g, '')
        .split('\n')
        .filter(Boolean);
      this.log.push(...lines);
      if (this.log.length > 40) this.log.splice(0, this.log.length - 40);
      // Erros e avisos vão para o log da Luna (journalctl), sem a chave
      for (const l of lines) if (/err|warn|fail|tuya|webrtc/i.test(l)) console.warn(`[go2rtc] ${l.slice(0, 400)}`);
    };
    proc.stdout!.on('data', keep);
    proc.stderr!.on('data', keep);
    proc.on('error', (e) => this.log.push(e.message));
    this.proc = proc;
    // Espera a porta local abrir (até 6 s)
    for (let i = 0; i < 30; i++) {
      if (proc.exitCode !== null) throw new Error(`go2rtc não iniciou: ${this.recentLog().join(' | ') || 'sem mensagem'}`);
      if (await this.portOpen()) return;
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  private portOpen() {
    return new Promise<boolean>((done) => {
      const s = connect(this.port, '127.0.0.1');
      s.once('connect', () => (s.destroy(), done(true)));
      s.once('error', () => done(false));
      s.setTimeout(500, () => (s.destroy(), done(false)));
    });
  }

  stop() {
    this.proc?.kill();
    this.proc = null;
  }
}
