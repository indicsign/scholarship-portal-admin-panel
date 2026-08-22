# The platform administration panel, built to static files and served by nginx.
#
# nginx is not just a file server here: it also proxies the API, which is what
# makes this image behave like `npm run dev`. See nginx.conf.template.

# --- build -------------------------------------------------------------------

FROM node:22-alpine AS build

WORKDIR /app

# The lockfile first, and `npm ci` rather than `npm install`: ci installs
# exactly what the lockfile pins and fails if the two disagree, so an image
# cannot quietly acquire a different dependency tree than the one tested.
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .

# Vite substitutes import.meta.env at build time, so this is baked into the
# bundle and cannot be changed by an environment variable on the running
# container. It must match API_VERSION on the server; a mismatch sends every
# request to a path the API does not serve.
ARG VITE_API_VERSION=v1
ENV VITE_API_VERSION=${VITE_API_VERSION}

# VITE_API_TARGET is deliberately not set. It configures the Vite dev and
# preview proxy, and neither of those runs in this image — nginx does the
# proxying instead, to API_TARGET below.
RUN npm run build

# --- runtime -----------------------------------------------------------------

FROM nginx:1.27-alpine

# Where the API is. Unlike VITE_API_VERSION this is *not* baked into the bundle:
# it is read at container start, so the same image serves the compose stack and
# a deployment without being rebuilt. The ARG only moves the default — anything
# set on the container overrides it.
#
# The default is the compose service name, which is what makes `docker compose
# up` work with no configuration at all.
ARG API_TARGET=http://api:8080
ENV API_TARGET=${API_TARGET}

# Docker's embedded DNS, which exists only on user-defined networks. A plain
# `docker run` with no --network has nothing listening there and every proxied
# request answers 502; see nginx.conf.template.
ENV DNS_RESOLVER=127.0.0.11

# envsubst replaces every ${NAME} it is given, and the entrypoint gives it every
# environment variable unless filtered. Unfiltered, a HOSTNAME in the
# environment would rewrite nothing here (nginx's own variables are $host, not
# ${HOST}) — but the failure mode if one ever collided is a config file that
# still parses and quietly proxies somewhere else, so the substitution is
# restricted to the three names the template actually uses.
ENV NGINX_ENVSUBST_FILTER='^(API_TARGET|API_HOST|DNS_RESOLVER)$'

# Sourced by the image's entrypoint before the template is rendered: it fills in
# the defaults, derives API_HOST, and refuses to start on an API_TARGET nginx
# would reject. --chmod because a *.envsh without the execute bit is skipped
# with a log line and no error, which would leave the template rendered from an
# empty environment.
COPY --chmod=0755 docker-entrypoint.d/10-api-target.envsh /docker-entrypoint.d/
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# The port inside the container. Compose publishes it on 5174 to match the
# port `npm run dev` uses, so bookmarks and the API's CORS allow-list hold.
EXPOSE 80

# This container's own liveness, deliberately not /healthz: that one proxies to
# the API, so a panel that is serving perfectly in front of a stopped API would
# report itself unhealthy and be restarted for somebody else's outage.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/nginx-alive || exit 1
