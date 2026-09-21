#!/bin/sh
set -eu

cd /home/container
exec /bin/sh -c "${STARTUP:-cd /opt/arrakis-dashboard && exec node src/config/server-launcher.mjs start}"
