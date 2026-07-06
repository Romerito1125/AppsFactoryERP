const { existsSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const prismaVersion = '7.8.0';
const cacheDir = join(process.env.LOCALAPPDATA || process.env.TEMP, 'opencode-prisma-cli');
const binPath = join(cacheDir, 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma');

require('dotenv').config({ path: join(process.cwd(), '.env') });

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });

  if (result.error) {
    console.error(result.error);
  }

  return result.status ?? 1;
}

if (!existsSync(binPath)) {
  mkdirSync(cacheDir, { recursive: true });

  const initStatus = run('npm', ['init', '-y'], { cwd: cacheDir });
  if (initStatus !== 0) process.exit(initStatus);

  const installStatus = run(
    'npm',
    ['install', `prisma@${prismaVersion}`, `@prisma/client@${prismaVersion}`],
    { cwd: cacheDir },
  );
  if (installStatus !== 0) process.exit(installStatus);
}

process.exit(run(binPath, process.argv.slice(2)));
