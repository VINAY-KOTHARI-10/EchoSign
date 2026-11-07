# EchoSign: one image, one process. The Express backend serves the built React app and the API.
#   docker build -t echosign .
#   docker run --env-file backend/.env -p 5000:10000 echosign

# ── 1. Build the React app ───────────────────────────────────
FROM node:20-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── 2. Install backend dependencies (needs the Prisma schema for `prisma generate`) ──
FROM node:20-slim AS backend-deps
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/package*.json ./
COPY backend/prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate

# ── 3. Runtime ───────────────────────────────────────────────
FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=10000
WORKDIR /app
COPY --from=backend-deps /app/backend/node_modules ./backend/node_modules
COPY backend/ ./backend/
COPY --from=frontend /app/frontend/dist ./frontend/dist
RUN mkdir -p backend/logs && chown -R node:node /app
USER node
WORKDIR /app/backend
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD curl -fsS http://localhost:${PORT}/health || exit 1
# Applies pending database migrations, then starts the server.
CMD ["npm", "run", "start:migrate"]
