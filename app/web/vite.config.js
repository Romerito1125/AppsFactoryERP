import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function resolveApiProxyTarget(env) {
  if (env.VITE_API_PROXY_TARGET) {
    return env.VITE_API_PROXY_TARGET
  }

  const apiEnvPath = path.resolve(__dirname, '../api/.env')

  if (fs.existsSync(apiEnvPath)) {
    const apiEnv = fs.readFileSync(apiEnvPath, 'utf8')
    const portMatch = apiEnv.match(/^PORT=(\d+)$/m)

    if (portMatch?.[1]) {
      return `http://127.0.0.1:${portMatch[1]}`
    }
  }

  return 'http://127.0.0.1:3000'
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  const apiTarget = resolveApiProxyTarget(env)

  return {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return undefined
            }

            if (id.includes('react-router-dom') || id.includes('react-dom') || id.includes('react')) {
              return 'react-vendor'
            }

            if (id.includes('@tanstack/react-query')) {
              return 'query-vendor'
            }

            if (id.includes('recharts')) {
              return 'charts-vendor'
            }

            if (id.includes('framer-motion')) {
              return 'motion-vendor'
            }

            if (id.includes('lucide-react') || id.includes('sonner') || id.includes('vaul')) {
              return 'ui-vendor'
            }

            return 'vendor'
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (routePath) => routePath.replace(/^\/api/, ''),
        },
      },
    },
  }
})
