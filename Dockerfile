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
# after each FROM, and a RUN would record their values in the history of
# the final image (docker history). Directories are created in the build
# stage, ownership is set by COPY --chown.
FROM docker.io/library/node:20-bookworm-slim AS run

# Kept as-is on purpose: baking DATABASE_* into the image is a known leak.
# Their removal (runtime-only variables, Coolify build args off) is
# planned in URG-07, together with a check on the Coolify side.
ARG DATABASE_HOST
ARG DATABASE_PORT
ARG DATABASE_NAME
ARG DATABASE_USERNAME
ARG DATABASE_PASSWORD

ENV DATABASE_HOST $DATABASE_HOST
ENV DATABASE_PORT $DATABASE_PORT
ENV DATABASE_NAME $DATABASE_NAME
ENV DATABASE_USERNAME $DATABASE_USERNAME
ENV DATABASE_PASSWORD $DATABASE_PASSWORD

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
# copies its timings and, before removing the old container, waits for
# "healthy": about 60 s, then 4 polls 15 s apart (~105 s to boot).
# An unhealthy new container is removed and the old one kept running.
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=4 \
  CMD ["node", "/app/scripts/healthcheck.js"]

CMD ["npm", "start"]
