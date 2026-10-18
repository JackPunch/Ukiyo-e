# ---------------------------------------------------------------------------
# ukiyo-e web image (static Vite build served by nginx)
#
# Build context MUST be the repo root (npm workspaces + the shared package):
#   docker build -f apps/web/Dockerfile -t ukiyo-e-web .
#   docker run --rm -p 8080:80 ukiyo-e-web
#
# Normally you won't run this alone — use the root docker-compose.yml, which
# also starts the api service and points nginx's `/api` proxy at it.
# ---------------------------------------------------------------------------

# --- build: produce the static site ---------------------------------------
FROM node:24-alpine AS build
WORKDIR /app

# Manifests first so the install layer is cached until a lockfile changes.
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

# Source needed to build: web (app) + shared (its dependency, source-only).
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN npm run build -w @ukiyo-e/web

# --- runtime: serve the build with nginx ----------------------------------
FROM nginx:stable-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
# The base image already defines: CMD ["nginx", "-g", "daemon off;"]
