import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Move, Pencil, Trash2, XCircle } from "lucide-react";
import { api, errorMessage } from "../services/api";
import { useCameras } from "../stores/cameras";
import { Button, inputClass } from "./ui";

interface DirectCam {
  id: string;
  entityId: string;
  name: string;
  url: string;
  username: string | null;
  hasPassword: boolean;
  transport: "udp" | "tcp";
  onvifPort: number | null;
}

const EMPTY = {
  id: "",
  name: "",
  url: "",
  username: "admin",
  password: "",
  transport: "udp" as "udp" | "tcp",
};

/**
 * Câmeras lidas diretamente pela DIA (RTSP), para modelos que o Home Assistant não consegue mostrar
 * (ex.: Yoosee H.265 só por UDP). A senha fica no servidor e nunca volta para o navegador.
 */
export function DirectCameras() {
  const [list, setList] = useState<DirectCam[] | null>(null);
  const [ffmpeg, setFfmpeg] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const [result, setResult] = useState<{ ok: boolean; detail: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api<{ ffmpeg: boolean; cameras: DirectCam[] }>("/api/cameras/direct")
      .then((r) => {
        setList(r.cameras);
        setFfmpeg(r.ffmpeg);
      })
      .catch((e) => setError(errorMessage(e)));
  useEffect(() => {
    void load();
  }, []);

  const body = () => ({
    name: form.name,
    url: form.url,
    username: form.username || null,
    password: form.password || null,
    transport: form.transport,
    ...(form.id ? { id: form.id } : {}),
  });

  const test = async () => {
    setBusy("test");
    setResult(null);
    try {
      const { name: _n, ...b } = body();
      setResult(
        await api<{ ok: boolean; detail: string }>("/api/cameras/direct/test", {
          body: b,
        }),
      );
    } catch (e) {
      setResult({ ok: false, detail: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy("save");
    setError(null);
    try {
      const { id: _i, ...b } = body() as ReturnType<typeof body> & {
        id?: string;
      };
      if (form.id)
        await api(`/api/cameras/direct/${form.id}`, {
          method: "PATCH",
          body: b,
        });
      else await api("/api/cameras/direct", { body: b });
      setForm(EMPTY);
      setOpen(false);
      setResult(null);
      await load();
      void useCameras.getState().load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (c: DirectCam) => {
    if (!confirm(`Remover a câmera “${c.name}” da DIA?`)) return;
    try {
      await api(`/api/cameras/direct/${c.id}`, { method: "DELETE" });
      await load();
      void useCameras.getState().load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const [ptzBusy, setPtzBusy] = useState<string | null>(null);
  const [ptzMsg, setPtzMsg] = useState<
    Record<string, { ok: boolean; detail: string }>
  >({});
  const enableMove = async (c: DirectCam) => {
    setPtzBusy(c.id);
    try {
      const r = await api<{ ok: boolean; detail: string }>(
        `/api/cameras/direct/${c.id}/onvif`,
        { body: {} },
      );
      setPtzMsg((m) => ({ ...m, [c.id]: r }));
      if (r.ok) {
        await load();
        void useCameras.getState().load();
      }
    } catch (e) {
      setPtzMsg((m) => ({
        ...m,
        [c.id]: { ok: false, detail: errorMessage(e) },
      }));
    } finally {
      setPtzBusy(null);
    }
  };
  const disableMove = async (c: DirectCam) => {
    await api(`/api/cameras/direct/${c.id}/onvif`, { method: "DELETE" }).catch(
      (e) => setError(errorMessage(e)),
    );
    setPtzMsg((m) => ({
      ...m,
      [c.id]: { ok: true, detail: "movimento desativado" },
    }));
    await load();
    void useCameras.getState().load();
  };

  const edit = (c: DirectCam) => {
    setForm({
      id: c.id,
      name: c.name,
      url: c.url,
      username: c.username ?? "",
      password: "",
      transport: c.transport,
    });
    setResult(null);
    setOpen(true);
  };

  return (
    <div className="space-y-3 px-4 py-3">
      <p className="text-xs text-white/45">
        Para câmeras que não aparecem pelo Home Assistant (ex.: Yoosee em
        H.265). A DIA se conecta direto à câmera e converte o vídeo para tocar
        no iPhone, Android e Fire TV. Se houver uma câmera do Home Assistant com
        o mesmo nome, ela é substituída por esta.
      </p>
      {!ffmpeg && (
        <p className="rounded-sm border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
          Falta o conversor de vídeo no servidor. No ZimaOS, rode:{" "}
          <code>sudo bash scripts/ffmpeg-setup.sh</code>
        </p>
      )}
      {error && <p className="text-xs text-rose-300">{error}</p>}

      {list?.map((c) => (
        <div key={c.id} className="rounded-sm border border-white/10">
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm">{c.name}</p>
              <p className="truncate text-xs text-white/40">
                {c.url} · {c.transport.toUpperCase()}
                {c.username ? ` · ${c.username}` : ""}
                {c.hasPassword ? " · senha salva" : ""}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                aria-label={`Editar ${c.name}`}
                onClick={() => edit(c)}
                className="rounded-sm p-2 text-white/60 hover:text-white"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                aria-label={`Remover ${c.name}`}
                onClick={() => void remove(c)}
                className="rounded-sm p-2 text-rose-300/70 hover:text-rose-200"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-white/5 px-3 py-2 text-xs">
            <Move className="h-3.5 w-3.5 text-cyan-300/70" />
            {c.onvifPort ? (
              <>
                <span className="text-emerald-300">
                  Movimento ativo (ONVIF, porta {c.onvifPort})
                </span>
                <button
                  onClick={() => void disableMove(c)}
                  className="ml-auto text-white/45 underline"
                >
                  desativar
                </button>
              </>
            ) : (
              <>
                <span className="text-white/50">Sem movimento</span>
                <button
                  onClick={() => void enableMove(c)}
                  disabled={ptzBusy === c.id}
                  className="ml-auto rounded-sm border border-cyan-300/40 px-2 py-1 text-cyan-100 disabled:opacity-50"
                >
                  {ptzBusy === c.id ? "Procurando ONVIF…" : "Ativar movimento"}
                </button>
              </>
            )}
            {ptzMsg[c.id] && (
              <p
                className={`w-full ${ptzMsg[c.id]!.ok ? "text-emerald-300" : "text-rose-300"}`}
              >
                {ptzMsg[c.id]!.detail}
              </p>
            )}
          </div>
        </div>
      ))}

      {!open ? (
        <Button
          variant="ghost"
          onClick={() => (setForm(EMPTY), setResult(null), setOpen(true))}
        >
          + Adicionar câmera direta
        </Button>
      ) : (
        <form
          onSubmit={(e) => void save(e)}
          className="space-y-2 rounded-sm border border-cyan-300/20 p-3"
        >
          <input
            className={inputClass}
            placeholder="Nome (ex.: Entrada)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            maxLength={60}
          />
          <input
            className={inputClass}
            placeholder="rtsp://192.168.15.112:554/onvif1"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            required
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className={inputClass}
              placeholder="Usuário"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              autoCapitalize="off"
              autoComplete="off"
            />
            <input
              className={inputClass}
              type="password"
              placeholder={
                form.id ? "Senha (vazio = manter)" : "Senha da câmera"
              }
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete="new-password"
            />
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-sm bg-white/5 p-1">
            {(["udp", "tcp"] as const).map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setForm({ ...form, transport: t })}
                className={`rounded-sm py-1.5 text-sm ${form.transport === t ? "border border-cyan-300/60 bg-cyan-400/20 text-cyan-50" : "text-white/70"}`}
              >
                {t.toUpperCase()}
                {t === "udp" ? " (Yoosee)" : ""}
              </button>
            ))}
          </div>
          {result && (
            <p
              className={`flex items-start gap-1.5 text-xs ${result.ok ? "text-emerald-300" : "text-rose-300"}`}
            >
              {result.ok ? (
                <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" />
              ) : (
                <XCircle className="mt-px h-3.5 w-3.5 shrink-0" />
              )}
              {result.ok ? `Conectou: ${result.detail}` : result.detail}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => void test()}
              disabled={!form.url || busy !== null}
            >
              {busy === "test" ? "Testando… (até 20 s)" : "Testar conexão"}
            </Button>
            <Button type="submit" disabled={busy !== null}>
              {busy === "save"
                ? "Salvando…"
                : form.id
                  ? "Salvar alterações"
                  : "Adicionar"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => (setOpen(false), setResult(null))}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
