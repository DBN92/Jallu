import { api } from '../services/api';

/** Este aparelho pode receber avisos? (app instalado por https; o app Android do tablet mostra na tela) */
export function pushSupport(): { ok: boolean; why?: string } {
  if (!window.isSecureContext) return { ok: false, why: 'Os avisos só funcionam abrindo a Luna pelo endereço https (fora de casa, pelo Cloudflare).' };
  if ((window as unknown as { DiaAndroid?: unknown }).DiaAndroid) return { ok: false, why: 'No app do tablet os avisos aparecem na própria tela.' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    return { ok: false, why: ios ? 'No iPhone, instale a Luna na tela de início (Compartilhar › Adicionar à Tela de Início) e abra por lá.' : 'Este navegador não recebe avisos.' };
  }
  return { ok: true };
}

const toKey = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function registration() {
  return navigator.serviceWorker.ready;
}

/** Endereço de aviso deste aparelho (null = avisos desligados aqui) */
export async function currentEndpoint(): Promise<string | null> {
  if (!pushSupport().ok) return null;
  try {
    return (await (await registration()).pushManager.getSubscription())?.endpoint ?? null;
  } catch {
    return null;
  }
}

function deviceLabel() {
  const ua = navigator.userAgent;
  return /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Navegador';
}

export async function enablePush(): Promise<void> {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'As notificações estão bloqueadas para a Luna. Libere nos ajustes do celular.' : 'Permissão não concedida.');
  const { publicKey } = await api<{ publicKey: string }>('/api/push/key');
  const reg = await registration();
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }));
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api('/api/push/subscribe', { body: { endpoint: j.endpoint, keys: j.keys, label: deviceLabel() } });
}

export async function disablePush(): Promise<void> {
  const sub = await (await registration()).pushManager.getSubscription();
  if (!sub) return;
  await api('/api/push/unsubscribe', { body: { endpoint: sub.endpoint } }).catch(() => undefined);
  await sub.unsubscribe();
}
