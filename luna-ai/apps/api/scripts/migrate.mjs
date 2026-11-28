// Aplica as migrações do Prisma usando o mesmo .env e a mesma resolução de caminho da API.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(apiDir, '..', '..');
const envFile = process.env.LUNA_ENV_FILE ?? resolve(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

let url = process.env.DATABASE_URL ?? 'file:./data/luna.db';
if (url.startsWith('file:') && !isAbsolute(url.slice(5))) url = `file:${resolve(root, url.slice(5))}`;
if (url.startsWith('file:')) mkdirSync(dirname(url.slice(5)), { recursive: true });

console.log(`Banco de dados: ${url}`);
execFileSync(process.execPath, [resolve(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
  cwd: apiDir,
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
});
