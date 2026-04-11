# GlycoQuant frontend — React + Vite built to static assets, served by nginx.

# ----- Build stage -----
FROM node:20-bookworm-slim AS build
WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# Copy source and build
COPY . .
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

# ----- Runtime stage -----
FROM nginx:1.27-alpine

# SPA fallback config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# Railway sets $PORT; generate nginx config at runtime using that value
CMD ["/bin/sh", "-c", "sed -i \"s/listen 80/listen ${PORT:-80}/g\" /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
