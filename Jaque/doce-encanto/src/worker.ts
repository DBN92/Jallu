import { ExecutionContext } from '@cloudflare/workers-types';

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // Tenta buscar o asset solicitado
    let response = await env.ASSETS.fetch(request);

    // Se não encontrar (404) e for uma requisição de página (não tem extensão de arquivo ou aceita html)
    // Retorna o index.html para o React Router lidar com a rota
    if (response.status === 404 && !url.pathname.includes('.')) {
      response = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url)));
    }
    
    return response;
  },
};
