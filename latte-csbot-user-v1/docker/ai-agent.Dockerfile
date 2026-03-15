# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY latte-csbot_ai-agent/ ./latte-csbot_ai-agent/
RUN npm run build:ai-agent

# Stage 2: Production
FROM node:20-alpine
RUN apk add --no-cache wget
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps
COPY --from=builder /app/latte-csbot_ai-agent/dist ./latte-csbot_ai-agent/dist
COPY .env* ./
WORKDIR /app/latte-csbot_ai-agent
ENV NODE_ENV=production
ENV PORT=8765
EXPOSE 8765
CMD ["node", "dist/ai-agent.js"]
