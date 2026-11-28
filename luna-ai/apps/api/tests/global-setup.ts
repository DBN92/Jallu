import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

export default function setup() {
  const dir = resolve(__dirname, '.tmp');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const url = `file:${resolve(dir, 'test.db')}`;
  process.env.TEST_DATABASE_URL = url;
  execSync('npx prisma migrate deploy', { cwd: resolve(__dirname, '..'), env: { ...process.env, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: '1' }, stdio: 'ignore' });
}
