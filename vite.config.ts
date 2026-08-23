import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// The admin panel runs on its own origin and calls the API on another. In
// development that is proxied rather than sent cross-origin, for one specific
// reason: the refresh token is an HttpOnly cookie scoped to /api/{version}/auth,
// and a same-origin proxy means the browser sends it without any CORS
// credentials dance. It also keeps this app's own origin out of the API's
// allow-list during development. The container does the same thing with nginx —
// see nginx.conf.template.
export default defineConfig(({ mode }) => {
  // loadEnv, not process.env. Vite reads .env into import.meta.env for the
  // application but does NOT put it in process.env, so `process.env.API_TARGET`
  // here would always be undefined and the proxy would silently fall back to
  // localhost:8080 no matter what .env said. loadEnv reads the same files, and a
  // real environment variable still wins over them, so `API_TARGET=… npm run dev`
  // keeps working.
  //
  // API_ has to be named in the prefix list. loadEnv filters by prefix, so with
  // 'VITE_' alone `env.API_TARGET` is undefined however it is set — the proxy
  // would then have `target: undefined` and every call would fail in a way that
  // looks like the API is down rather than like a misread variable.
  //
  // API_TARGET rather than VITE_API_TARGET so this file and nginx.conf.template
  // read one name: the panel is pointed at an API the same way whether it is
  // served by `vite preview` or by the container. It is deliberately not a VITE_
  // variable — those are substituted into the bundle at build time, and the
  // API's address is a deployment property, not something baked into the
  // JavaScript.
  const env = loadEnv(mode, process.cwd(), ['VITE_', 'API_'])
  const target = env.API_TARGET ?? 'http://localhost:8080'

  // changeOrigin on every entry, not just /api: a public API is reached by a
  // name that routes on Host, and sending it `localhost:5174` gets somebody
  // else's vhost or a certificate mismatch.
  const proxy = {
    '/api': { target, changeOrigin: true },
    '/healthz': { target, changeOrigin: true },
    '/readyz': { target, changeOrigin: true },
  }

  return {
    plugins: [react()],
    // `vite preview` reads preview.proxy and ignores server.proxy. Without both,
    // `npm run dev` works and `npm run preview` answers every API call with the
    // static server's own 404 — which looks like a broken build rather than a
    // missing proxy.
    server: { port: 5174, proxy },
    preview: { port: 5174, proxy },
  }
})
