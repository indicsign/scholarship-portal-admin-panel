/* Route parity check.
 *
 * Extracts every API path the frontend calls and asserts the backend actually
 * mounts it. This exists because of a bug it would have caught: an endpoint was
 * moved out from behind a role guard, which changed its path, and the frontend
 * kept calling the old one. Both the backend tests and the frontend build
 * passed — the mismatch only exists in the gap between them.
 *
 *   npm run check:routes          (needs the stack running: cd ../backend && make dev)
 *
 * A path is missing only when the API answers NO_SUCH_ENDPOINT. A plain 404 is
 * not enough: probing an endpoint with a placeholder id legitimately returns
 * "we could not find that organisation", which is the route working correctly.
 * Authorisation failures and validation errors are likewise fine — this checks
 * that the route exists, not that the call succeeds.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createHmac } from 'node:crypto'

const BASE = process.env.API_BASE ?? 'http://localhost:5174/api/v1'
// The seeded platform super admin. Its username, rather than its address,
// because that is what the panel's own sign-in screen now leads with.
const ACCOUNT = process.env.PROBE_USER ?? 'admin'
const PASSWORD = process.env.PROBE_PASS ?? 'Sde@2026'
const SECRET = process.env.DEV_TOTP_SECRET ?? 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'

/* --- collect the paths the frontend calls ---------------------------------- */

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

// Matches the string literal passed to api.get/post/del/request, capturing the
// helper's name so the verb comes from the call site rather than being guessed
// from the path. Guessing produced false MISSING reports, which read as a
// broken route and cost more to investigate than the check saves.
const CALL = /\b(get|post|del|request)\s*(?:<[^>]*>)?\s*\(\s*[`']([^`']+)[`']/g
// api.request carries its verb in an options object a little further along.
const EXPLICIT_METHOD = /method:\s*'(\w+)'/
// Template literals interpolate an id; substituting a real uuid keeps the path
// shape while remaining a value the router will accept.
const PLACEHOLDER = /\$\{[^}]+\}/g

const HELPER_METHOD = { get: 'GET', post: 'POST', del: 'DELETE' }

// path -> method. A path called with two verbs keeps the first; both are
// mounted or neither is, which is all this checks.
const paths = new Map()
for (const file of walk('src').filter(f => /\.tsx?$/.test(f))) {
  const source = readFileSync(file, 'utf8')
  for (const m of source.matchAll(CALL)) {
    const [, helper, path] = m
    if (!path.startsWith('/') || paths.has(path)) continue

    // request() states its method in the options that follow the path.
    const tail = source.slice(m.index + m[0].length, m.index + m[0].length + 200)
    const method = HELPER_METHOD[helper]
      ?? EXPLICIT_METHOD.exec(tail)?.[1]?.toUpperCase()
      ?? 'GET'

    paths.set(path, method)
  }
}

/* --- sign in ---------------------------------------------------------------- */

function totp() {
  const key = Buffer.from(
    SECRET.replace(/=+$/, '')
      .split('')
      .map(c => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c.toUpperCase()).toString(2).padStart(5, '0'))
      .join('')
      .match(/.{8}/g)
      .map(b => parseInt(b, 2)),
  )

  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))

  const digest = createHmac('sha1', key).update(counter).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const code = digest.readUInt32BE(offset) & 0x7fffffff

  return String(code % 1_000_000).padStart(6, '0')
}

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

let token
try {
  let res = await call('/auth/login', { method: 'POST', body: { identifier: ACCOUNT, password: PASSWORD } })
  if (res.body?.data?.mfa_required) {
    res = await call('/auth/login', {
      method: 'POST',
      body: { identifier: ACCOUNT, password: PASSWORD, mfa_code: totp() },
    })
  }
  token = res.body?.data?.token?.access_token
  if (!token) throw new Error(JSON.stringify(res.body))
} catch (err) {
  console.error(`Could not sign in to ${BASE}.`)
  console.error('Start the stack first:  cd ../backend && make dev')
  console.error(String(err.message ?? err))
  process.exit(2)
}

/* --- probe ------------------------------------------------------------------- */

const SAMPLE_UUID = '00000000-0000-0000-0000-000000000000'
let missing = 0
console.log(`Checking ${paths.size} paths against ${BASE}\n`)

for (const raw of [...paths.keys()].sort()) {
  const path = raw.replace(PLACEHOLDER, SAMPLE_UUID)
  const method = paths.get(raw)
  const sendsBody = method === 'POST' || method === 'PUT' || method === 'PATCH'

  const { status, body } = await call(path, { method, token, body: sendsBody ? {} : undefined })
  const mounted = !(status === 404 && body?.error?.code === 'NO_SUCH_ENDPOINT')

  if (!mounted) missing++
  console.log(`  ${mounted ? 'ok    ' : 'MISSING'} ${method.padEnd(4)} ${raw}${raw !== path ? `  (as ${path})` : ''}`)
}

console.log()
if (missing) {
  console.error(`${missing} path(s) the frontend calls do not exist on the backend.`)
  process.exit(1)
}
console.log('Every path the frontend calls is mounted.')
