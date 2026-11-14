import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// `npm run dev:phone` sets DOGDEX_HTTPS=1: camera-free features like geolocation and the share sheet
// only work in a secure context, and a phone reaching your computer over Wi-Fi isn't "localhost".
const https = process.env.DOGDEX_HTTPS === '1'

/**
 * Link-preview tags (og:image and friends) need absolute URLs. index.html uses the placeholder __SITE_URL__,
 * which becomes VITE_SITE_URL (your deployed address, no trailing slash). Unset, it becomes empty and the
 * tags use root-relative paths, which work for the app itself but not for most link-preview crawlers.
 */
function siteUrl(env: Record<string, string>): Plugin {
  const base = (env.VITE_SITE_URL ?? '').trim().replace(/\/+$/, '')
  return { name: 'dogdex-site-url', transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', base) }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), siteUrl(loadEnv(mode, process.cwd(), 'VITE_')), ...(https ? [basicSsl()] : [])],
  server: https ? { host: true } : undefined,
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
}))
