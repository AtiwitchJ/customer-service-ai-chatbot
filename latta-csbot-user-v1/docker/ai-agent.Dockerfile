FROM node:20-alpine

# Install wget for healthcheck
RUN apk add --no-cache wget

WORKDIR /app

# Copy root package.json for shared dependencies
COPY package*.json ./

# Install dependencies (only production)
RUN npm ci --omit=dev --legacy-peer-deps

# Copy AI agent code
COPY latta-csbot_ai-agent/ ./latta-csbot_ai-agent/

# Copy shared config
COPY .env* ./

WORKDIR /app/latta-csbot_ai-agent

# Default environment variables
ENV NODE_ENV=production
ENV PORT=8765

# Expose port for the main workflow server
EXPOSE 8765

# The actual CMD is usually overridden in docker-compose.yml
# Default: runs the all-in-one ai-agent.js
CMD ["node", "ai-agent.js"]
