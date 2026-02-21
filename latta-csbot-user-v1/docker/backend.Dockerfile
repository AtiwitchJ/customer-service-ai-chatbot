FROM node:20-alpine@sha256:09e2b3d9726018aecf269bd35325f46bf75046a643a66d28360ec71132750ec8

# Install wget for healthcheck
RUN apk add --no-cache wget

WORKDIR /app

# Copy root package.json for shared dependencies
COPY package*.json ./

# Install dependencies (only production)
RUN npm ci --omit=dev --legacy-peer-deps

# Copy backend code
COPY backend/ ./backend/

# Copy shared config
COPY .env* ./

WORKDIR /app/backend

# Default environment variables
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/config || exit 1

CMD ["node", "server.js"]
