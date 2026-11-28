import { build } from 'esbuild';

// Empacota a API (incluindo @luna/shared) em dist/server.js.
// Dependências de node_modules ficam externas, exceto o pacote compartilhado.
await build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  packages: 'external',
  alias: { '@luna/shared': '../../packages/shared/src/index.ts' },
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: 'info',
});
