# syntax=docker/dockerfile:1

FROM node:22-alpine AS build

WORKDIR /opt/arrakis-dashboard
ENV NEXT_TELEMETRY_DISABLED=1

# Install dependencies first so the layer caches independently of source changes.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build \
    && npm prune --omit=dev

FROM node:22-alpine AS runtime

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    SERVER_HOSTNAME=0.0.0.0

# Run as an unprivileged user; the Pterodactyl egg expects the "container" account.
RUN addgroup -S container \
    && adduser -S container -G container \
    && mkdir -p /home/container \
    && chown -R container:container /home/container

WORKDIR /opt/arrakis-dashboard
COPY --from=build --chown=container:container /opt/arrakis-dashboard/package.json ./
COPY --from=build --chown=container:container /opt/arrakis-dashboard/node_modules/ ./node_modules/
COPY --from=build --chown=container:container /opt/arrakis-dashboard/.next/ ./.next/
COPY --from=build --chown=container:container /opt/arrakis-dashboard/next.config.ts ./
COPY --from=build --chown=container:container /opt/arrakis-dashboard/next-env.d.ts ./
COPY --from=build --chown=container:container /opt/arrakis-dashboard/postcss.config.mjs ./
COPY --from=build --chown=container:container /opt/arrakis-dashboard/src/proxy.ts ./src/
COPY --from=build --chown=container:container /opt/arrakis-dashboard/src/config/server-launcher.mjs ./src/config/
COPY --from=build --chown=container:container /opt/arrakis-dashboard/src/assets/ ./src/assets/
COPY --from=build --chown=container:container /opt/arrakis-dashboard/CHANGELOG.md ./
COPY --chown=container:container docker/entrypoint.sh /entrypoint.sh

USER container
EXPOSE 2008
CMD ["/bin/sh", "/entrypoint.sh"]
