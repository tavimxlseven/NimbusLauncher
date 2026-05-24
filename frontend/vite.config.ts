import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // Forward cookies so the Rails session works cross-origin in dev
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            // Forward the cookie header as-is
            if (req.headers.cookie) {
              proxyReq.setHeader('Cookie', req.headers.cookie)
            }
          })
          proxy.on('proxyRes', (proxyRes) => {
            // Make Set-Cookie work cross-origin (remove SameSite=Lax if present)
            const setCookie = proxyRes.headers['set-cookie']
            if (setCookie) {
              proxyRes.headers['set-cookie'] = setCookie.map((c: string) =>
                c.replace(/;\s*SameSite=\w+/gi, '').replace(/;\s*Secure/gi, '')
              )
            }
          })
        },
      },
      '/auth': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            if (req.headers.cookie) {
              proxyReq.setHeader('Cookie', req.headers.cookie)
            }
          })
          proxy.on('proxyRes', (proxyRes) => {
            const setCookie = proxyRes.headers['set-cookie']
            if (setCookie) {
              proxyRes.headers['set-cookie'] = setCookie.map((c: string) =>
                c.replace(/;\s*SameSite=\w+/gi, '').replace(/;\s*Secure/gi, '')
              )
            }
          })
        },
      },
    },
  },

  test: {
    globals: true,
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost' } },
    setupFiles: ['./src/test/setup.ts'],
  },
})
