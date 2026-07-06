const { existsSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { homedir } = require('node:os');
const { spawnSync } = require('node:child_process');

const prismaVersion = '7.8.0';
const cacheRoot =
  process.env.LOCALAPPDATA ||
  (process.platform === 'win32'
    ? join(homedir(), 'AppData', 'Local')
    : process.env.XDG_CACHE_HOME || join(homedir(), '.cache'));
const cacheDir = join(cacheRoot, 'opencode-prisma-cli');
const binPath = join(cacheDir, 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma');

require('dotenv').config({ path: join(process.cwd(), '.env') });

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    ...options,
  });

  if (result.error) {
    console.error(result.error);
  }

  return result.status ?? 1;
}

function resolveLocalPrismaCli() {
  try {
    return require.resolve('prisma/build/index.js', {
      paths: [process.cwd()],
    });
  } catch {
    return null;
  }
}

const localPrismaCli = resolveLocalPrismaCli();

if (localPrismaCli) {
  process.exit(run(process.execPath, [localPrismaCli, ...process.argv.slice(2)]));
}

if (!existsSync(binPath)) {
  mkdirSync(cacheDir, { recursive: true });

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  const initStatus = run(npmCommand, ['init', '-y'], { cwd: cacheDir });
  if (initStatus !== 0) process.exit(initStatus);

  const installStatus = run(
    npmCommand,
    ['install', `prisma@${prismaVersion}`, `@prisma/client@${prismaVersion}`],
    { cwd: cacheDir },
  );
  if (installStatus !== 0) process.exit(installStatus);
}

process.exit(run(binPath, process.argv.slice(2)));
