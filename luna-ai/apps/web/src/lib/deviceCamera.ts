/**
 * Câmera frontal deste aparelho, compartilhada entre quem precisa dela (presença, gestos, recados).
 * O Android não deixa abrir a mesma câmera duas vezes; aqui ela abre uma vez só e fecha quando
 * ninguém mais está usando. Só funciona em página segura (https, ou o app Android 1.0.8+).
 */
let stream: MediaStream | null = null;
let video: HTMLVideoElement | null = null;
let users = 0;
let opening: Promise<HTMLVideoElement> | null = null;

export const cameraAvailable = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;

export function acquireCamera(): Promise<HTMLVideoElement> {
  users++;
  if (video && stream?.active) return Promise.resolve(video);
  if (!opening) {
    opening = (async () => {
      if (!cameraAvailable()) throw new Error('A câmera só funciona pelo app Android da Luna (1.0.8 ou mais nova) ou por um endereço https.');
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.srcObject = s;
      // O vídeo NÃO entra na página: no app Android (WebView), um vídeo escondido na página deixa a
      // tela inteira preta. Fora da página ele continua funcionando; se pausar, a presença retoma.
      await v.play();
      stream = s;
      video = v;
      return v;
    })().finally(() => {
      opening = null;
    });
  }
  return opening.catch((err) => {
    users = Math.max(0, users - 1);
    throw err;
  });
}

export function releaseCamera() {
  users = Math.max(0, users - 1);
  if (users > 0) return;
  // Fecha um pouco depois: se outro uso vier logo em seguida, não pisca o aviso de câmera do Android
  setTimeout(() => {
    if (users > 0) return;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video = null;
  }, 1500);
}

/**
 * Fecha a câmera na hora, mesmo com outros usando (a tela vai apagar e o app passa a vigiar com ela).
 * Quem estava usando percebe que o vídeo parou e pede a câmera de novo quando a tela voltar.
 */
export function forceCloseCamera() {
  users = 0;
  stream?.getTracks().forEach((t) => t.stop());
  video?.remove();
  stream = null;
  video = null;
}

/** Trilha de vídeo da câmera aberta (para gravar recados junto com o microfone) */
export const cameraTrack = () => stream?.getVideoTracks()[0] ?? null;
