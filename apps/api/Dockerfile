# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# ukiyo-e API image
#
# This is an npm-workspaces monorepo, so the build context MUST be the repo
# root (the lockfile + every workspace `package.json` are needed for `npm ci`):
#
#   docker build -f apps/api/Dockerfile -t ukiyo-e-api .
#   docker run --rm -p 3000:3000 ukiyo-e-api
#
# The API runs its TypeScript source directly via `tsx` (no compile step) and
# `@ukiyo-e/shared` is source-only, so the image ships source + node_modules.
# ---------------------------------------------------------------------------

FROM node:24-alpine AS base
WORKDIR /app

# --- deps: install all workspace dependencies ------------------------------
# Copy only the manifests first so this layer is cached until a lockfile /
# package.json changes. `npm ci` fails if the lockfile is out of sync.
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

# --- runtime ---------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# Workspace deps are linked as symlinks in node_modules (e.g.
# node_modules/@ukiyo-e/shared -> ../../packages/shared), so the source trees
# must keep the same relative paths here for the links to resolve.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
# tsx reads apps/api/tsconfig.json at startup, which extends this file.
COPY --chown=node:node tsconfig.base.json ./
COPY --chown=node:node packages/shared ./packages/shared
COPY --chown=node:node apps/api ./apps/api

# Run as the unprivileged user that ships with the base image.
USER node
EXPOSE 3000

# `start` → `tsx src/index.ts` (see apps/api/package.json)
CMD ["npm", "run", "start", "-w", "@ukiyo-e/api"]
