import { useState } from 'react';

/**
 * Ajustes › Widgets do iPhone: passo a passo do Scriptable (grátis) e o botão que copia o script.
 * A chave é a mesma dos Atalhos da Siri (criada na seção acima); o script guarda no Keychain do iPhone.
 */
export function WidgetSettings() {
  const [msg, setMsg] = useState<string | null>(null);
  const copy = async () => {
    setMsg(null);
    try {
      // Já vai com o endereço desta Luna preenchido (só falta a chave)
      const code = (await (await fetch('/luna-widget.js', { cache: 'no-store' })).text()).replace("const DEFAULT_URL = '';", `const DEFAULT_URL = '${location.origin}';`);
      await navigator.clipboard.writeText(code);
      setMsg('Script copiado! Agora cole no Scriptable (passo 2).');
    } catch {
      setMsg('Não consegui copiar sozinho. Abra o link “ver o script”, selecione tudo e copie.');
    }
  };
  return (
    <div className="space-y-3 p-4 text-sm">
      <p className="text-xs text-white/55">Widgets da Luna na tela de início e de bloqueio, sem app da App Store pago: usa o app gratuito Scriptable. O iPhone atualiza os widgets a cada 15–30 min (não serve como alarme do choro).</p>
      <ol className="list-decimal space-y-1.5 pl-5 text-[13px] text-white/80">
        <li>
          Instale o app <b>Scriptable</b> (grátis) na App Store.
        </li>
        <li>
          Toque em <b>Copiar script</b> abaixo. No Scriptable, toque em <b>+</b>, cole tudo e dê o nome <b>Luna</b>.
        </li>
        <li>
          Crie uma chave na seção <b>Siri e Atalhos</b> acima (pode chamar de “Widgets”) e copie.
        </li>
        <li>
          No Scriptable, toque no script <b>Luna</b> › <b>Configurar endereço e chave</b>. O endereço (<b>{location.origin}</b>) já vem no script: com a chave copiada, toque em <b>Colar chave</b>. A Luna testa na hora.
        </li>
        <li>
          Na tela de início, segure › <b>+</b> › <b>Scriptable</b> › escolha o tamanho. Segure o widget › <b>Editar widget</b> › Script: <b>Luna</b> · Parameter:
          <span className="block text-white/60">
            pequeno: <code>baba</code>, <code>resumo</code>, <code>gravacoes</code> ou <code>compras</code> · médio: <code>casa</code> ou <code>cameras</code> (mosaico de 4) · grande: vazio ou <code>cameras</code> (6) · para escolher quais: <code>cameras: portão, quintal, garagem, luiza</code> · tela de bloqueio: círculo <code>luiza</code> ou <code>luzes</code>, retângulo = lava e seca
          </span>
        </li>
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="m-chip act" onClick={() => void copy()}>
          Copiar script
        </button>
        <a className="text-xs text-sky-300 underline" href="/luna-widget.js" target="_blank" rel="noreferrer">
          ver o script
        </a>
      </div>
      {msg && <p className="text-xs text-emerald-300">{msg}</p>}
    </div>
  );
}
