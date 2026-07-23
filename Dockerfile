FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build


FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Cookies are only marked Secure when explicitly opted in; set to "true" if you
# terminate TLS in front of this container (reverse proxy). Left false by
# default so plain-HTTP deployments (e.g. Unraid LAN access) keep sessions.
ENV COOKIE_SECURE=false

# The database lives on a mounted volume, never in the image.
ENV DB_PATH=/data/finance.db

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
# Needed at runtime by db:init (src/db/migrate.ts + the src/config it imports).
COPY --from=builder /app/src ./src

RUN npm ci --omit=dev

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Persist the SQLite database here. This is an ANONYMOUS volume by default:
# you MUST bind-mount a host path to /data (e.g. -v /mnt/user/appdata/arca:/data)
# in your docker run / Unraid template, or data will be lost when the
# container is recreated.
VOLUME ["/data"]

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
