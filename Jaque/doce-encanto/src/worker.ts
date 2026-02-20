import type { ExecutionContext } from '@cloudflare/workers-types';

interface EnvBindings {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>
  }
}

const worker = {
  async fetch(request: Request, env: EnvBindings, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    let response = await env.ASSETS.fetch(request);
    if (response.status === 404 && !url.pathname.includes('.')) {
      response = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url)));
    }
    return response;
  },
};

export default worker;
