# Node 20 only: @strapi/pack-up 4.23.0 (pulled in by Strapi 4.26.2) refuses
# Node 22. Keep in sync with .nvmrc and engines.node in package.json.

# --- Production dependencies, installed from the committed lockfile ---
FROM docker.io/library/node:20-bookworm-slim AS deps

WORKDIR /app

COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile --production --network-timeout 600000 \
  && yarn cache clean

# --- Admin panel build ---
FROM deps AS build

COPY . .

ENV NODE_ENV production

RUN yarn build \
  && mkdir -p .tmp .cache public/uploads

# --- Runtime image, run as the unprivileged node user ---
# No RUN in this stage: Coolify injects its build variables as ARG right
# after each FROM, and a RUN placed after them records their values in the
# history of the final image (docker history). Build args are now off in
# Coolify for this app (URG-07), so nothing is injected; the rule stays as a
# safeguard.
# Directories are created in the build stage, ownership is set by
# COPY --chown.
FROM docker.io/library/node:20-bookworm-slim AS run

# No DATABASE_* (nor any other secret) in the image: Coolify gives them to
# the container at run time only, and its build args are off for this app
# (URG-07, 08/10/2026), so docker history holds no value.
ENV NODE_ENV production
ENV DB_CLIENT='postgres'

# /app does not exist yet in this stage: COPY creates it, owned by node
# like everything inside it (.tmp, .cache and public/uploads included).
COPY --from=build --chown=node:node /app /app

WORKDIR /app

USER node

EXPOSE 1337

# This slim image has neither curl nor wget, so Coolify's own HTTP
# healthcheck (curl || wget) cannot work here: the check below only needs
# Node (scripts/healthcheck.js, GET /_health -> 204). Coolify detects it,
# copies its timings and, before removing the old container, sleeps for
# the whole start period (30 s), then polls up to 8 times 10 s apart for
# "healthy" (~100 s to boot). An unhealthy new container is removed and
# the old one kept running. Traefik only routes a healthy container, so
# the 10 s interval also bounds the gap after a restart.
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=8 \
  CMD ["node", "/app/scripts/healthcheck.js"]

CMD ["npm", "start"]
