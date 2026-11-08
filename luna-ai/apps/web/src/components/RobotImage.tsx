import type { DeviceDto } from '@luna/shared';

/** Endereço da foto enviada para o robô (com versão, para atualizar o cache). */
export const robotPhotoUrl = (d: DeviceDto) => (d.vacuum?.photo ? `/api/devices/${d.entityId}/photo?v=${d.vacuum.photo}` : null);

/** Desenho genérico de robô aspirador visto de cima (usado quando não há foto). */
export function RobotDrawing({ size, led = '#34d399', glow }: { size: number; led?: string; glow?: string }) {
  return (
    <svg viewBox="-40 -40 80 80" width={size} height={size} aria-hidden>
      <defs>
        <radialGradient id="rbody" cx="40%" cy="35%" r="75%">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".7" stopColor="#e7eaf0" />
          <stop offset="1" stopColor="#b9bfca" />
        </radialGradient>
        <radialGradient id="rlidar" cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#5b6170" />
          <stop offset="1" stopColor="#1b1e26" />
        </radialGradient>
        <radialGradient id="rglow">
          <stop offset="0" stopColor={glow ?? led} stopOpacity=".5" />
          <stop offset="1" stopColor={glow ?? led} stopOpacity="0" />
        </radialGradient>
      </defs>
      {glow && <circle r="40" fill="url(#rglow)" />}
      <circle r="30" fill="url(#rbody)" />
      <path d="M-24 -18 A30 30 0 0 1 24 -18" fill="none" stroke="#9aa2ad" strokeWidth="3.2" strokeLinecap="round" />
      <circle cy="-7" r="10.5" fill="url(#rlidar)" stroke="#2b2f39" strokeWidth="1.5" />
      <rect x="-7.5" y="10" width="6" height="3.4" rx="1.7" fill="#c7ccd6" />
      <rect x="1.5" y="10" width="6" height="3.4" rx="1.7" fill="#c7ccd6" />
      <circle cy="18" r="1.6" fill={led} />
    </svg>
  );
}

/** Imagem do robô: a foto do próprio aparelho (se enviada) ou o desenho. */
export function RobotImage({ device, size, glow }: { device: DeviceDto; size: number; glow?: string }) {
  const url = robotPhotoUrl(device);
  if (!url) return <RobotDrawing size={size} glow={glow} />;
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      {glow && <span className="absolute -inset-2 rounded-full" style={{ background: `radial-gradient(circle, ${glow}55, transparent 70%)` }} />}
      <img src={url} alt={device.name} className="relative h-full w-full rounded-full object-cover" style={{ boxShadow: '0 6px 18px rgba(0,0,0,.45)' }} />
    </span>
  );
}

/**
 * Prepara a foto escolhida no celular: recorta um quadrado no centro e reduz para 640 px em JPEG.
 * (O iPhone entrega HEIC; desenhar no canvas converte para JPEG.)
 */
export async function squareJpeg(file: File, size = 640): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  canvas.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  bmp.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não consegui ler a foto.'))), 'image/jpeg', 0.88));
}
