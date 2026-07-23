# ─── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
# npm ci = clean install from package-lock.json (reproducible, faster than npm install)
RUN npm ci

# ─── Stage 2: Development server (hot-reload) ─────────────────────────────────
# We mount ./backend/src as a volume in docker-compose.yml so code changes
# are reflected without rebuilding the image.
FROM node:20-alpine AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "run", "start:dev"]
