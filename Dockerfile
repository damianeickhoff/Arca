# Two stages. The builder installs every dependency and runs `next build` with
# `output: "standalone"` (next.config.ts), which traces the files the server really
# needs into .next/standalone. The runner copies only that: no full node_modules, no
# src/, no .next/cache. Layer order matters for updates: node_modules first (changes only
# when package-lock.json does), the app code last (changes every release), so an update
# pulls the small code layers and reuses the big dependency layer.
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

# The lock file is written by npm 11; npm 10 (bundled with Node 22) reads its optional
# peer entries differently and refuses npm ci. Install with the same npm as development.
RUN npm install -g npm@11 && npm ci

COPY . .

RUN npm run build


FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
# The standalone server listens on these; Docker maps the port.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Cookies are only marked Secure when explicitly opted in; set to "true" if you
# terminate TLS in front of this container (reverse proxy). Left false by
# default so plain-HTTP deployments (e.g. Unraid LAN access) keep sessions.
ENV COOKIE_SECURE=false

# The database lives on a mounted volume, never in the image. Everything else that
# must survive an update (uploads, backups) lives next to it.
ENV DB_PATH=/data/finance.db

# Which build this is (publish.yml passes them): a release image is built from the
# vX.Y.Z tag; the dev image says "Beta" in the app so it is never mistaken for one.
ARG ARCA_BUILD_REF=""
ARG ARCA_BUILD_SHA=""
ARG ARCA_BUILD_DATE=""
ENV ARCA_BUILD_REF=$ARCA_BUILD_REF
ENV ARCA_BUILD_SHA=$ARCA_BUILD_SHA
ENV ARCA_BUILD_DATE=$ARCA_BUILD_DATE

# 1. The traced production dependencies: the big layer, stable between releases.
COPY --from=builder /app/.next/standalone/node_modules ./node_modules
# 2. The server and the build output: small, changes every release. Copied piece by
#    piece on purpose: the tracer also drops stray project folders (src/, tests/, …)
#    into .next/standalone, and none of those belong in the image.
COPY --from=builder /app/.next/standalone/package.json ./package.json
COPY --from=builder /app/.next/standalone/server.js ./server.js
COPY --from=builder /app/.next/standalone/.next ./.next
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Settings › About reads the release notes from this file at runtime.
COPY --from=builder /app/CHANGELOG.md ./CHANGELOG.md

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Persist the SQLite database here. This is an ANONYMOUS volume by default:
# you MUST bind-mount a host path to /data (e.g. -v /mnt/user/appdata/arca:/data)
# in your docker run / Unraid template, or data will be lost when the
# container is recreated.
VOLUME ["/data"]

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
