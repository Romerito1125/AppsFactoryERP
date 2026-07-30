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

const apiProcess = spawnProcess('api', apiDir)

apiProcess.on('exit', (code) => {
  if (!shuttingDown && !webProcess) {
    process.exit(code ?? 1)
  }
})

waitForApi(apiUrl, apiProcess)
  .then(() => {
    if (shuttingDown) {
      return
    }

    webProcess = spawnProcess('web', webDir)
    webProcess.on('exit', (code) => {
      if (!shuttingDown) {
        shutdown(code ?? 0)
      }
    })
  })
  .catch((error) => {
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

    try {
      const response = await fetch(url)
      if (response.ok) {
        console.log(`[dev] API lista en ${url}`)
        return
      }
    } catch {
      // La API sigue arrancando.
    }

    await new Promise((resolve) => setTimeout(resolve, 1500))
  }

  throw new Error(`La API no respondió en ${url} dentro del tiempo esperado`)
}

function shutdown(code) {
  if (shuttingDown) {
    return
  }

  shuttingDown = true

  for (const child of [webProcess, apiProcess]) {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM')
    }
  }

  setTimeout(() => process.exit(code), 200)
}
