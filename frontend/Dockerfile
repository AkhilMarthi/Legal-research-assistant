# ─── Stage 1: Build dependencies ──────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ─── Stage 2: Development server ──────────────────────────────────────────────
# For Phase 1, we run the dev server (hot-reload). 
# In production (Phase 18), we'd use a build + nginx stage.
FROM node:20-alpine AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 5173
# --host 0.0.0.0 is critical: without it, Vite binds to 127.0.0.1 inside the 
# container and the port is unreachable from the host machine.
CMD ["npm", "run", "dev"]
