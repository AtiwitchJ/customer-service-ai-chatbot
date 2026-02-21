# ===========================================
# ADMIN FRONTEND DOCKERFILE (Angular + Nginx)
# ===========================================

# ===========================================
# BUILD STAGE
# ===========================================
FROM node:20-slim AS build

WORKDIR /app

COPY frontend/package*.json ./

ARG SUPABASE_PUBLIC_URL
ARG ANON_KEY
ENV SUPABASE_PUBLIC_URL=$SUPABASE_PUBLIC_URL
ENV ANON_KEY=$ANON_KEY

RUN npm install --legacy-peer-deps

COPY frontend/ ./

RUN npm run build -- --configuration=production

# ===========================================
# PRODUCTION STAGE (Nginx)
# ===========================================
FROM nginx:alpine AS production

COPY --from=build /app/nginx.conf /etc/nginx/conf.d/default.conf

# Angular outputs to dist/<project-name>/browser
COPY --from=build /app/dist/frontend-ng/browser/ /usr/share/nginx/html/

EXPOSE 81

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:81/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
