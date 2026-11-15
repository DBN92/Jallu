import { Component, type ReactNode } from 'react';
import { diag } from '../lib/diag';

/**
 * Se algum erro derrubar a tela, mostra um aviso com “Recarregar” em vez de deixar tudo preto,
 * e registra o erro no diagnóstico do servidor. Recarrega sozinho uma vez depois de 5 s.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  private timer: number | null = null;

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    diag(`ERRO na tela: ${error.message}`);
    // Uma tentativa automática (sem ficar em laço se o erro se repetir)
    if (!sessionStorage.getItem('luna.autoReload')) {
      sessionStorage.setItem('luna.autoReload', '1');
      this.timer = window.setTimeout(() => location.reload(), 5000);
    }
  }

  componentWillUnmount() {
    if (this.timer) clearTimeout(this.timer);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, background: '#06070d', color: '#e6faff', fontFamily: 'sans-serif', textAlign: 'center' }}>
        <h2 style={{ color: '#22d3ee', margin: 0 }}>A Luna encontrou um problema</h2>
        <p style={{ opacity: 0.7, margin: 0, maxWidth: 420 }}>O erro foi registrado para correção. Toque em recarregar para tentar de novo.</p>
        <p style={{ opacity: 0.45, margin: 0, fontSize: 12, maxWidth: 420 }}>{this.state.error.message}</p>
        <button onClick={() => location.reload()} style={{ fontSize: 18, padding: '12px 28px', borderRadius: 24, border: 0, background: '#22d3ee', color: '#06070d' }}>
          Recarregar
        </button>
      </div>
    );
  }
}
