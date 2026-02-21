# ===========================================
# ADMIN BACKEND DOCKERFILE (Node.js + Multimodal RAG Integration)
# ===========================================

FROM node:20-slim AS base

# Install system dependencies
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ===========================================
# DEPENDENCIES STAGE
# ===========================================
FROM base AS deps

COPY backend/package*.json ./
RUN npm install --omit=dev --legacy-peer-deps


# ===========================================
# PRODUCTION STAGE
# ===========================================
FROM base AS production

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

# Copy all backend files
COPY backend/server_combined.js ./
COPY backend/package*.json ./
COPY backend/src/ ./src/
COPY backend/config/ ./config/

# Create cache directories
RUN mkdir -p /app/cache
RUN mkdir -p /app/src/dashboard_service/utils

# Create JSON data directories (for persistent storage)
RUN mkdir -p /app/data/chats/sessions /app/data/chats/index /app/data/analytics /app/data/uploads

# Set environment variables for multimodal RAG integration
# ENV RAG_UPLOAD_PROXY_URL is set in docker-compose or defaults to http://latta-multimodal-rag:8001


EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3002/api/overview || exit 1

CMD ["node", "server_combined.js"]
