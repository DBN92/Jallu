import { create } from 'zustand';
import { api, errorMessage } from '../services/api';

interface PhotosState {
  /** Ids das fotos do álbum (null = ainda não carregou) */
  ids: string[] | null;
  load: () => Promise<void>;
  /** Envia as fotos escolhidas; devolve a mensagem de erro, se houver */
  add: (files: File[], onProgress?: (done: number, total: number) => void) => Promise<string | null>;
  remove: (id: string) => Promise<string | null>;
}

/**
 * Prepara a foto escolhida: reduz para no máximo 1600 px e converte para JPEG.
 * (O iPhone entrega HEIC; desenhar no canvas converte para JPEG.)
 */
export async function shrinkJpeg(file: File, max = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * k));
  canvas.height = Math.max(1, Math.round(bmp.height * k));
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não consegui ler a foto.'))), 'image/jpeg', 0.85));
}

export const usePhotos = create<PhotosState>((set) => ({
  ids: null,
  load: async () => {
    try {
      set({ ids: await api<string[]>('/api/photos') });
    } catch {
      set({ ids: [] });
    }
  },
  add: async (files, onProgress) => {
    let done = 0;
    for (const f of files) {
      try {
        const form = new FormData();
        form.append('photo', await shrinkJpeg(f), 'foto.jpg');
        set({ ids: await api<string[]>('/api/photos', { method: 'POST', form }) });
      } catch (err) {
        return files.length > 1 ? `Parei na foto ${done + 1} de ${files.length}: ${errorMessage(err)}` : errorMessage(err);
      }
      onProgress?.(++done, files.length);
    }
    return null;
  },
  remove: async (id) => {
    try {
      set({ ids: await api<string[]>(`/api/photos/${id}`, { method: 'DELETE' }) });
      return null;
    } catch (err) {
      return errorMessage(err);
    }
  },
}));
