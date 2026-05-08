# GlycoQuant frontend — Vite build served by nginx.
#
# Built by Railway service "web" (see railway.toml). Build context is
# the frontend/ directory (root_dir=frontend in Railway settings).
#
# Build arg:
#   VITE_API_BASE_URL  baked into the bundle at build time. Redeploy on change.
#
# Runtime: Railway injects $PORT; nginx config is rendered from the
# template via envsubst at container start so it binds to that port.

# ---------- Stage 1: build the Vite bundle ----------
FROM node:22-alpine AS builder

WORKDIR /app

ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json vite.config.ts tailwind.config.ts postcss.config.js index.html ./
COPY public ./public
COPY src ./src

RUN npm run build

# ---------- Stage 2: nginx static server ----------
FROM nginx:1.27-alpine

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist /usr/share/nginx/html

ENV PORT=8080
EXPOSE 8080

# nginx:1.27-alpine entrypoint already runs envsubst on files in
# /etc/nginx/templates/, expanding $PORT into the rendered config.
CMD ["nginx", "-g", "daemon off;"]
