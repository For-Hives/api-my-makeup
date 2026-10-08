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
FROM docker.io/library/node:20-bookworm-slim AS run

WORKDIR /app

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

RUN chown node:node /app

COPY --from=build --chown=node:node /app ./

USER node

EXPOSE 1337

CMD ["npm", "start"]
