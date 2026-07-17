# syntax=docker/dockerfile:1

# ---- Build stage: install the full workspace and build the client bundle ----
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/client/package.json packages/client/
COPY packages/server/package.json packages/server/
COPY packages/shared/package.json packages/shared/
ENV PUPPETEER_SKIP_DOWNLOAD=1
RUN npm ci

COPY tsconfig.base.json ./
COPY packages ./packages

# Empty VITE_SERVER_PORT makes the client connect back to the origin that
# served it (see packages/client/src/config.ts), so one container = one URL.
ENV VITE_SERVER_PORT=""
RUN npm run build --workspace=@starbuds/client

# ---- Runtime stage: production deps + server source + built client ----
# The server runs from TypeScript source via tsx, matching how `npm run dev`
# and the smoke test run it (@starbuds/shared only ships .ts sources).
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/client/package.json packages/client/
COPY packages/server/package.json packages/server/
COPY packages/shared/package.json packages/shared/
ENV PUPPETEER_SKIP_DOWNLOAD=1
RUN npm ci --omit=dev

COPY packages/shared/src packages/shared/src
COPY packages/server/src packages/server/src
COPY --from=build /app/packages/client/dist packages/client/dist

ENV PORT=7777
ENV CLIENT_DIST=/app/packages/client/dist
EXPOSE 7777

CMD ["./node_modules/.bin/tsx", "packages/server/src/index.ts"]
