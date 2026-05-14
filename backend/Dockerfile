# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# ── Stage 2: production image ─────────────────────────────────────────────────
FROM node:24-alpine

RUN apk upgrade --no-cache

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY src/db/schema.sql ./dist/db/schema.sql

RUN mkdir -p /app/uploads
RUN addgroup -S ppai && adduser -S ppai -G ppai
RUN chown -R ppai:ppai /app
USER ppai

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001
CMD ["node", "dist/server.js"]
