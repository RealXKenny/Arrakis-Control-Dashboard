FROM node:22-bookworm AS build

WORKDIR /opt/arrakis-dashboard
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim

LABEL org.opencontainers.image.description="Web dashboard for Dune: Awakening server operations, Discord OAuth, and live telemetry."

RUN usermod --login container --home /home/container --move-home node \
    && groupmod --new-name container node

WORKDIR /opt/arrakis-dashboard
COPY --chown=container:container --from=build /opt/arrakis-dashboard/package.json ./
COPY --chown=container:container --from=build /opt/arrakis-dashboard/node_modules/ ./node_modules/
COPY --chown=container:container --from=build /opt/arrakis-dashboard/.next/ ./.next/
COPY --chown=container:container --from=build /opt/arrakis-dashboard/next.config.ts ./
COPY --chown=container:container --from=build /opt/arrakis-dashboard/src/config/server-launcher.mjs ./src/config/
COPY --chown=container:container --from=build /opt/arrakis-dashboard/src/assets/ ./src/assets/
COPY --chown=container:container --from=build /opt/arrakis-dashboard/CHANGELOG.md ./
COPY --chown=container:container docker/entrypoint.sh /entrypoint.sh

USER container
ENV USER=container HOME=/home/container NODE_ENV=production SERVER_HOSTNAME=0.0.0.0
WORKDIR /home/container
EXPOSE 2008
CMD ["/bin/sh", "/entrypoint.sh"]
