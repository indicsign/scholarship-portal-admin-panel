#!/bin/sh
# Does the built image actually serve the panel?
#
#   sh scripts/smoke-image.sh indicsign/sp-admin:local
#   npm run check:image                      (the same, on the default tag)
#
#   EXPECT_API_VERSION   the version the bundle should call   (default v1)
#   EXPECT_API_TARGET    the API the container should proxy to (default http://api:8080)
#   PORT                 host port to publish on              (default 18174)
#
# CI runs exactly this, rather than a list of inline `docker run` steps, so that
# a failing publish can be reproduced on a laptop with one command instead of
# being read out of a log. Nothing here needs the API, or a network beyond
# localhost: an unreachable API_TARGET is one of the things being checked.
#
# It asserts what a broken build of this image actually looks like, which is
# never a build failure:
#
#   * the config template rendered, and rendered with the address it was given
#   * an address nginx would reject is refused at start-up, by name
#   * the bundle calls the API version it was built for
#   * a deep link reloads as the app, not as a 404
#   * /api is proxied rather than swallowed by the single-page fallback
#   * a fingerprinted asset that does not exist is a 404, not index.html
set -eu

# The tag to exercise. Defaults to what `docker compose build` produces locally,
# so the common case is `npm run check:image` with no arguments.
IMAGE=${1:-${ADMIN_IMAGE:-indicsign/sp-admin:local}}
EXPECT_API_VERSION=${EXPECT_API_VERSION:-v1}
EXPECT_API_TARGET=${EXPECT_API_TARGET:-http://api:8080}
PORT=${PORT:-18174}

NAME="sp-admin-smoke-$$"
FAILED=0

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

pass() { printf '  ok    %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; FAILED=$((FAILED + 1)); }

# The Host header the entrypoint should derive: the target without its scheme,
# port kept, path dropped.
expect_host=${EXPECT_API_TARGET#*://}
expect_host=${expect_host%%/*}

echo "image:  $IMAGE"
echo "target: $EXPECT_API_TARGET  (Host: $expect_host)"
echo

# --- 1. the configuration template rendered ---------------------------------
#
# `nginx -T` runs the entrypoint first — it renders the template, then execs
# this — so it dumps the configuration the container would really serve.

echo "configuration"
rendered=$(docker run --rm -e API_TARGET="$EXPECT_API_TARGET" "$IMAGE" nginx -T 2>&1) || {
    echo "$rendered"
    fail "nginx rejected its own rendered configuration"
    exit 1
}

if printf '%s' "$rendered" | grep -qF "set \$api ${EXPECT_API_TARGET};"; then
    pass "proxies to $EXPECT_API_TARGET"
else
    fail "the rendered config does not proxy to $EXPECT_API_TARGET"
fi

if printf '%s' "$rendered" | grep -qE "proxy_set_header +Host +${expect_host};"; then
    pass "sends Host: $expect_host upstream"
else
    fail "the rendered config does not send Host: $expect_host"
fi

# An unsubstituted ${NAME} parses as a literal and silently proxies nowhere, so
# a leftover is a failure even though nginx accepted the file. Only the rendered
# server block is examined: `nginx -T` also dumps mime.types and the stock
# nginx.conf, neither of which is ours.
leftovers=$(printf '%s' "$rendered" | sed -n '/^# configuration file .*default.conf:/,/^# configuration file /p' | grep -c '\${' || true)
if [ "$leftovers" -eq 0 ]; then
    pass "no unsubstituted \${...} left in the rendered config"
else
    fail "$leftovers unsubstituted \${...} in the rendered config"
fi

# --- 2. a target nginx would reject is refused by name -----------------------

if out=$(docker run --rm -e API_TARGET=api.example.org "$IMAGE" nginx -T 2>&1); then
    echo "$out" | tail -3
    fail "a schemeless API_TARGET started anyway"
else
    if printf '%s' "$out" | grep -q 'API_TARGET must start with'; then
        pass "a schemeless API_TARGET is refused, and says so"
    else
        printf '%s\n' "$out" | tail -3
        fail "a schemeless API_TARGET failed for some other reason"
    fi
fi

# --- 3. the bundle calls the version it was built for ------------------------
#
# Vite folds `/api/${VERSION}` into a literal at minification, so the path the
# panel calls is greppable in the bundle. If this ever fails right after a
# toolchain upgrade, check that first — a minifier that stops folding the
# template literal breaks the assertion, not the image.

echo
echo "bundle"
if docker run --rm --entrypoint sh "$IMAGE" -c \
        "grep -rlF '/api/${EXPECT_API_VERSION}' /usr/share/nginx/html/assets >/dev/null"; then
    pass "calls /api/$EXPECT_API_VERSION"
else
    fail "no asset references /api/$EXPECT_API_VERSION — VITE_API_VERSION did not reach the build"
fi

# --- 4. it serves ------------------------------------------------------------

echo
echo "serving on :$PORT"
docker run -d --name "$NAME" -p "127.0.0.1:${PORT}:80" \
    -e API_TARGET="$EXPECT_API_TARGET" "$IMAGE" >/dev/null

base="http://127.0.0.1:${PORT}"
up=0
i=0
while [ "$i" -lt 30 ]; do
    if [ "$(curl -s -o /dev/null -w '%{http_code}' "$base/nginx-alive" || true)" = "204" ]; then
        up=1
        break
    fi
    i=$((i + 1))
    sleep 1
done

if [ "$up" -ne 1 ]; then
    docker logs "$NAME" 2>&1 | tail -20
    fail "the container never answered /nginx-alive"
    exit 1
fi
pass "answers /nginx-alive"

status() { curl -s -o /dev/null -w '%{http_code}' "$base$1"; }

# The root, and a deep link. Both must be the app: a reload on /organisations is
# the single-page fallback, and a 404 there is the classic broken deployment.
for path in / /organisations /organisations/00000000-0000-0000-0000-000000000000; do
    code=$(status "$path")
    if [ "$code" = "200" ] && curl -s "$base$path" | grep -q 'id="root"'; then
        pass "GET $path serves the app"
    else
        fail "GET $path answered $code"
    fi
done

# index.html names the fingerprinted bundles; a cached copy pins the browser to
# filenames the next deploy removes.
if curl -sI "$base/index.html" | grep -qi 'cache-control: *no-store'; then
    pass "index.html is no-store"
else
    fail "index.html is missing Cache-Control: no-store"
fi

asset=$(curl -s "$base/" | grep -o '/assets/[A-Za-z0-9._-]*\.js' | head -1)
if [ -n "$asset" ]; then
    if [ "$(status "$asset")" = "200" ] && curl -sI "$base$asset" | grep -qi 'immutable'; then
        pass "$asset is served immutable"
    else
        fail "$asset is not served, or not immutable"
    fi
else
    fail "index.html references no /assets/*.js"
fi

# A missing fingerprinted asset must be a 404. Falling through to index.html
# would hand the browser HTML where it asked for JavaScript, and the app would
# fail with a MIME type error that names nothing useful.
code=$(status "/assets/does-not-exist.js")
if [ "$code" = "404" ]; then
    pass "a missing asset is a 404"
else
    fail "a missing asset answered $code"
fi

# The API is not running, and that is the point: a proxied path must fail as a
# gateway error. 200 here would mean /api fell through to the app, which is the
# failure that looks like a working panel until the first request.
code=$(status "/api/${EXPECT_API_VERSION}/auth/login")
case "$code" in
    502|504) pass "/api/$EXPECT_API_VERSION is proxied (upstream unreachable: $code)" ;;
    200)     fail "/api/$EXPECT_API_VERSION answered 200 — it is being served by the app, not proxied" ;;
    *)       pass "/api/$EXPECT_API_VERSION is proxied (upstream answered $code)" ;;
esac

echo
if [ "$FAILED" -eq 0 ]; then
    echo "all checks passed"
else
    echo "$FAILED check(s) failed"
    docker logs "$NAME" 2>&1 | tail -20
    exit 1
fi
