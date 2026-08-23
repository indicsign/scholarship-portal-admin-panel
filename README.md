# Admin panel

The platform operator's console. React + TypeScript + Vite, talking to the Go
API in `../backend`.

```bash
cd ../backend && make dev     # API + workers
npm run dev                   # this panel, on :5174
```

Sign in with `admin` / `Sde@2026`. A sign-in code is emailed each time; get it
with `cd ../backend && make token ACCOUNT=admin`.

The field takes a username, an email address or a mobile number, so
`superadmin@example.org` reaches the same account. Every other seeded account
keeps `DevPassword123!` and has a username of its own — see
`../backend/databases/README.md`.

## Keyboard

Press `?` in the panel for the list. Single keys, no modifiers, ignored while
you are typing and while a dialog is open.

| Keys | Does |
|---|---|
| `g` `d` | Dashboard |
| `g` `o` | Organisations |
| `g` `e` | Ecosystem |
| `g` `r` | Data requests |
| `g` `l` | Slides |
| `g` `a` | Audit trail |
| `g` `s` | Support access |
| `/` | Focus this screen's search or first filter |
| `?` | Show the list |

A screen offers `/` by marking one control `data-primary-filter`; a screen with
nothing to filter has none and the key does nothing.

## Data requests (FR-20)

`/data-requests` is the operator's queue for exports and erasures a student has
asked for. Exports are assembled by a worker; **an erasure waits here for a
person**, because it cannot be undone and because the law sometimes says the
data must be kept.

Erasure is **redaction, not deletion**, and that is load-bearing rather than a
shortcut. Every table referencing `student_profile` cascades on delete, and the
chain runs profile → application → sanction → disbursement — so a plain DELETE
would destroy the financial records the platform tells the student, at the
moment they ask, that it is obliged to keep. The profile row survives as a
tombstone holding no personal data, and the money and audit trail stay attached
to it. See `0013_erasure.sql`, and the integration test that asserts both
halves.

Erasing and declining are Super Admin only. Both are irreversible in one
direction or the other.

## The two reporting screens

They look similar and are not interchangeable.

**Dashboard** (`/dashboard`) is the internal operations view and the panel's
landing screen — registrations, reach, the application funnel, awards made and
money actually paid, over a period you choose. Counted from live records and
**not suppressed**, because platform staff can already open any single account
through support search, and a view whose small numbers vanish is useless in the
weeks when every number is small. It is the working view, not the one to paste
into a deck.

**Ecosystem** (`/ecosystem`) is the aggregate of FR-16: anonymised, suppressed
below five students per cell, and built to leave the building.

## Who this is for

Three roles — the only ones with global scope (Table 3.1 of the report):

| Role | Can do |
|---|---|
| `PLATFORM_SUPER_ADMIN` | Everything, including approving organisations and starting support sessions |
| `PLATFORM_STAFF` | Support sessions, grievance handling, reading the trail |
| `COMPLIANCE_OFFICER` | Reads the audit trail. Holds no write path anywhere |

Everyone else is scoped to one organisation or one student. A student or a case
worker who signs in here is turned away with an explanation rather than left to
collect 403s — see `applyLogin` in `lib/auth.tsx`.

The NGO, corporate and government portals are separate products (§4.2) and are
not built yet.

## Screens

| Route | What it does |
|---|---|
| `/organisations` | The approval queue. Approving admits an organisation to applicants' certificates, so both decisions open a dialog and a rejection needs a reason |
| `/ecosystem` | FR-16 — the aggregate view no single provider can see: under-served groups, under-subscribed schemes, and whether verification reuse is actually happening |
| `/audit` | FR-10 — append-only, enforced by the database. Defaults to refused actions, because a successful login is not what anybody opened this screen to find |
| `/support` | Impersonation. Fifteen minutes, mandatory reason, disclosed to the user afterwards |

## How it is put together

```
src/
  lib/
    api.ts           one client — base path, error shape, refresh-and-retry
    auth.tsx         AuthProvider: the two-step MFA flow and session restore
    auth-context.ts  the context and useAuth
    hooks.ts         useQuery, useDebounced
    roles.ts         which roles may be here
    types.ts         the API contract, hand-written and narrow
    format.ts        en-IN money, dates, relative times
  components/
    Layout.tsx       shell, nav, and the impersonation banner
    Announcer.tsx    the app's single ARIA live region
    ui.tsx           Field, Dialog, Pill, Pager, states
  pages/             one file per screen
  styles.css         tokens and base styles
```

A few decisions that are not obvious from the code:

**The access token lives in memory only.** `localStorage` would survive a reload
and would also hand the token to any script that runs on this origin. The
refresh cookie is HttpOnly and already provides survive-a-reload, so a refresh
silently re-establishes the session instead — which is why the first paint is a
"restoring your session" state rather than a login form.

**One refresh at a time.** The server rotates the refresh token on every use and
treats a replayed one as theft, revoking the whole family. Five widgets hitting
a 401 at once must produce one refresh, not five, or the operator is signed out
for no reason. `api.ts` shares the in-flight promise.

**Vite proxies `/api` rather than sending cross-origin.** Same-origin means the
browser sends the HttpOnly refresh cookie without any CORS credentials handling,
and keeps this app's origin out of the API's allow-list in development.

**The API version is configuration.** `VITE_API_VERSION` builds every path, and
must match `API_VERSION` on the server.

## Colours

Both themes, with the person able to override the device — light, dark, or
follow-my-device.

The override is not a preference feature here. Light sensitivity and photophobia
make a dark ground far easier to read for long, and both are common with
migraine and with several of the conditions the RPwD Act recognises.
Astigmatism runs the other way: light text on a dark ground halates, and
somebody with it reads a light theme faster and with less fatigue. Picking one
fails one of those groups, and the device setting is not a reliable proxy — it
is often whatever the phone shipped with, or what a family member chose.

The choice is applied before the first paint by an inline script in
`index.html`. Reading it from React would leave one frame of white on screen —
a flash in a darkened room, at the moment somebody who chose dark for light
sensitivity is looking at it.

`npm run check:contrast` measures every foreground/background pair the UI uses,
in both palettes, against 4.5:1 for text and 3:1 for control boundaries. It
exists because the ratios were originally hand-written into the CSS as comments
and two of them were wrong — a comment claiming 4.6:1 over a colour measuring
4.47:1 is worse than no comment, because it looks like the check was done.

## Accessibility

WCAG 2.2 Level AA is a mandatory acceptance criterion for every portal (§7.1),
not only the student-facing ones. What that means here:

- A skip link is the first tab stop on every page, and moves focus to `<main>`.
- Focus indicators are defined once, globally, and never removed.
- Async results are spoken through one live region — approving an organisation
  changes a table row, which is silent without it.
- Dialogs are real `<dialog showModal()>`: focus trapping, Escape, and inertness
  come from the platform rather than from code that has to get them right.
- Tables are real tables with `scope`-ed headers and captions.
- Colour never carries meaning alone; every pill states its own value.
- Every control clears the 24×24 target-size minimum.
- Contrast ratios are recorded next to the colour tokens in `styles.css`.

Automated checks catch none of the interesting failures. Screen-reader testing
with NVDA and TalkBack is part of the definition of done for a user-facing
ticket, and has not been done for this panel.

## Deployment

One container: the built bundle behind an nginx that also proxies `/api` to the
API, so the browser only ever sees one origin. That is the same arrangement
`npm run dev` uses and for the same reason — the refresh token is an HttpOnly
cookie scoped to `/api/{version}/auth`, and a second origin would mean CORS with
credentials on every call and a `SameSite=None` cookie.

```bash
docker compose up -d --build                       # build this repo and run it
docker compose pull && docker compose up -d        # run the published image

API_TARGET=https://api.example.org docker compose up -d
sh scripts/smoke-image.sh indicsign/sp-admin:latest   # or: npm run check:image
```

Two settings point the panel at an API, and they are not interchangeable:

| Setting | Read | Why it has to be there |
|---|---|---|
| `VITE_API_VERSION` | at build | Vite substitutes `import.meta.env` into the bundle, so the version every request path is built from is fixed when the image is built. It cannot be changed on a running container. Must match `API_VERSION` on the server |
| `API_TARGET` | at container start | nginx's proxy target. Deliberately *not* baked in, so one image serves any environment. `scheme://host[:port]`; a trailing slash is stripped, a missing scheme is refused by name, and a path is prefixed to every proxied request and logged as such |

`API_TARGET` defaults to `http://api:8080` — the API's service name on the
platform stack's compose network, which is what makes the root compose file work
with no configuration. Deployed, it is the API's own address, and two things
about the container change with it:

- **DNS.** The name is resolved through `DNS_RESOLVER`, which is taken from the
  container's own `/etc/resolv.conf` — Docker's embedded DNS on a compose
  network, the platform's resolver anywhere else. Set it only to override that.
- **`Host`.** nginx sends the API's hostname upstream, not the browser's,
  because a deployed API is reached through something that routes on `Host`.
  The original travels as `X-Forwarded-Host`.

Two more settings exist for the places this gets deployed, and neither needs
touching under compose:

- **`PORT`.** Platforms that assign a port set it and route only to it. The
  image listens on what `PORT` names, or 80, and the `HEALTHCHECK` resolves the
  same value — `LISTEN_PORT` overrides both.
- **`LISTEN_IPV6`.** The container listens on IPv6 wherever the kernel has it.
  Set this empty on a host that reports IPv6 but has it administratively
  disabled, where binding `[::]` stops nginx from starting at all.

The API sets the refresh cookie `Secure` whenever `APP_ENV=production`, so the
panel must be served over HTTPS or the operator is signed out by the first token
refresh. Compose publishes on loopback for that reason: something that
terminates TLS belongs in front of this container. It must also appear in the
API's `HTTP_TRUSTED_PROXIES`, or every visitor is rate-limited as one client —
this container — and the audit trail names it as the actor behind every request.

`.env.example` documents every setting; compose reads `.env` from this directory.

### CI

`.github/workflows/ci.yml` runs **check → image → publish**:

| Stage | Does | Runs on |
|---|---|---|
| `check` | eslint, `tsc -b`, the Vite build, and keeps `dist/` as an artifact | everything |
| `image` | builds the image with its defaults, starts it, and runs `scripts/smoke-image.sh` against it | everything |
| `publish` | rebuilds with the production version and address, re-runs the smoke test, pushes `:{sha}` and `:latest` to Docker Hub | `main` |

Only `publish` names the `production` environment. That is deliberate: a job
naming a protected environment waits for its reviewers, so keeping it out of the
first two stages means a pull request gets full lint, build and container
feedback without anybody being asked to approve anything, and the approval sits
where it belongs — on the push.

The environment (Settings → Environments → production) holds four secrets:

| Secret | Used for |
|---|---|
| `DOCKER_USERNAME` | the registry login, and the image namespace |
| `DOCKER_PASSWORD` | an access token with **Read & Write** scope. A read-only token logs in successfully and then fails on push |
| `VITE_API_VERSION` | the build argument above |
| `VITE_API_TARGET` | the address baked in as the image's default `API_TARGET` |

Both are checked before anything is built, because both fail quietly: an empty
`VITE_API_VERSION` overrides the Dockerfile's default with an empty string and
ships a panel calling `/api/`, and an address without a scheme is a target nginx
rejects. The image is pushed as `${DOCKER_USERNAME}/sp-admin`; set the
repository **variable** `IMAGE_NAME` to `namespace/name` for an
organisation-owned image, where the pushing account and the namespace are
different names.

The smoke test is a script rather than a list of workflow steps so that a failed
publish is reproducible with one command. It asserts what a broken build of this
image actually looks like — none of which is a build failure: the config
template rendered with the address it was given, an address nginx would reject is
refused by name at start-up, the bundle calls the API version it was built for,
a deep link reloads as the app rather than a 404, `/api` is proxied rather than
swallowed by the single-page fallback, a missing fingerprinted asset is a 404
rather than HTML served where JavaScript was asked for, and a platform-assigned
`PORT` moves both the listen directive and the socket that answers.

## Not built yet

Grievance handling (the API is there — `/grievances`), data-request processing
for FR-20, and feature flags, which Table 4.1 lists but the API does not yet
expose.

## Checks

```bash
npm run check:responsive   # every layout reflows to 320px (WCAG 2.2 SC 1.4.10)
npm run check:contrast     # every colour pair in both themes, against AA
npm run check:routes       # every path this panel calls, against the running API
npm run check:image        # the built container actually serves the panel
```

`check:contrast` and `check:responsive` read `../tools/`, which belongs to the
platform tree rather than to this repository, and `check:routes` needs the API
running (`cd ../backend && make dev`). CI runs neither for those reasons; it
runs `check:image`, as `scripts/smoke-image.sh`.

320px is not an arbitrary phone width — it is what a 1280px desktop becomes at
400% zoom, so one check covers the cheapest Android in portrait and a magnified
laptop at once. It reads grid floors, min-widths and inline `minWidth` styles
and fails the build if any of them force horizontal scrolling. Container
context is declared in `tools/check-responsive.py`; a selector with a new
parent needs its entry updated, and an unlisted one is reported as unverified
rather than passed.
