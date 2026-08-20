import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const rootDir = process.cwd()
const apiDir = path.join(rootDir, 'app', 'api')
const webDir = path.join(rootDir, 'app', 'web')
const apiPort = resolveApiPort(apiDir)
const apiUrl = `http://127.0.0.1:${apiPort}/`

let shuttingDown = false
let webProcess = null
let apiProcess = null

startDev().catch((error) => {
  console.error(`[dev] ${error.message}`)
  shutdown(1)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(0))
}

function resolveApiPort(apiDirectory) {
  const envPath = path.join(apiDirectory, '.env')

  if (!fs.existsSync(envPath)) {
    return 3000
  }

  const env = fs.readFileSync(envPath, 'utf8')
  const portMatch = env.match(/^PORT=(\d+)$/m)
  return Number(portMatch?.[1] ?? 3000)
}

function spawnProcess(label, cwd) {
  const child = spawn('bun', ['run', 'dev'], {
    cwd,
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: true,
  })

  pipeOutput(child.stdout, label)
  pipeOutput(child.stderr, label)

  child.on('error', (error) => {
    console.error(`[${label}] ${error.message}`)
  })

  return child
}

async function startDev() {
  if (await isApiReady(apiUrl)) {
    console.warn(`[dev] Ya existe una API activa en ${apiUrl}; se reutilizará para este frontend.`)
  } else {
    apiProcess = spawnProcess('api', apiDir)
    apiProcess.on('exit', (code) => {
      if (!shuttingDown) {
        console.error(`[dev] La API terminó inesperadamente (código ${code ?? 1}).`)
        shutdown(code ?? 1)
      }
    })

    await waitForApi(apiUrl, apiProcess)
  }

  if (shuttingDown) {
    return
  }

  webProcess = spawnProcess('web', webDir)
  webProcess.on('exit', (code) => {
    if (!shuttingDown) {
      shutdown(code ?? 0)
    }
  })
}

function pipeOutput(stream, label) {
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    const lines = chunk.split(/\r?\n/)

    for (const line of lines) {
      if (!line) continue
      console.log(`[${label}] ${line}`)
    }
  })
}

async function waitForApi(url, apiProcess) {
  const timeoutAt = Date.now() + 180000

  while (Date.now() < timeoutAt) {
    if (apiProcess.exitCode !== null) {
      throw new Error(`La API terminó antes de quedar lista (código ${apiProcess.exitCode})`)
    }

    if (await isApiReady(url)) {
      console.log(`[dev] API lista en ${url}`)
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 1500))
  }

  throw new Error(`La API no respondió en ${url} dentro del tiempo esperado`)
}

async function isApiReady(url) {
  try {
    const healthResponse = await fetch(new URL('health', url))
    if (healthResponse.ok) {
      return true
    }

    // Permite reutilizar una API anterior durante la transición al endpoint /health.
    const rootResponse = await fetch(url)
    return rootResponse.ok && (await rootResponse.text()).includes('Hello World')
  } catch {
    return false
  }
}

function terminateProcessTree(child) {
  if (!child || child.exitCode !== null || !child.pid) {
    return
  }

  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    killer.on('error', () => child.kill())
    return
  }

  child.kill('SIGTERM')
}

function shutdown(code) {
  if (shuttingDown) {
    return
  }

  shuttingDown = true

  for (const child of [webProcess, apiProcess]) {
    terminateProcessTree(child)
  }

  setTimeout(() => process.exit(code), 500)
}
