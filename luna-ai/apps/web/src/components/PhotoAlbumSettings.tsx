import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { usePhotos } from '../stores/photos';
import { Button } from './ui';

/** Álbum de fotos do descanso de tela: enviar do aparelho e apagar. As fotos ficam só no servidor da casa. */
export function PhotoAlbumSettings({ onFirstPhoto }: { onFirstPhoto?: () => void }) {
  const { ids, load, add, remove } = usePhotos();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => void load(), [load]);

  const pick = async (files: File[]) => {
    if (!files.length) return;
    const hadNone = !usePhotos.getState().ids?.length;
    setError(null);
    setBusy(`Enviando 1 de ${files.length}…`);
    const err = await add(files, (done, total) => done < total && setBusy(`Enviando ${done + 1} de ${total}…`));
    setBusy(null);
    setError(err);
    if (hadNone && usePhotos.getState().ids?.length) onFirstPhoto?.();
  };

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm">Fotos do descanso de tela</p>
          <p className="mt-0.5 text-xs text-white/45">
            {ids?.length ? `${ids.length} ${ids.length === 1 ? 'foto' : 'fotos'} no álbum. ` : 'Nenhuma foto ainda. '}Ficam guardadas só no servidor da sua casa e valem para todos os aparelhos.
          </p>
        </div>
        <Button type="button" variant="ghost" disabled={!!busy} onClick={() => input.current?.click()}>
          <ImagePlus className="h-4 w-4" /> {busy ?? 'Adicionar'}
        </Button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            void pick(files);
          }}
        />
      </div>
      {error && <p className="mt-2 text-xs text-rose-200">{error}</p>}
      {!!ids?.length && (
        <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
          {ids.map((id) => (
            <div key={id} className="relative aspect-square overflow-hidden rounded-sm bg-black">
              <img src={`/api/photos/${id}`} alt="" loading="lazy" className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label="Apagar foto"
                className="absolute top-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-black/65 text-white"
                onClick={async () => {
                  if (window.confirm('Apagar esta foto do álbum?')) setError(await remove(id));
                }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
