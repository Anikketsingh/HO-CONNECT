# HO Connect API (the root Dockerfile is the API: Fly.io's GitHub launcher only looks for ./Dockerfile).
# Build from the repo root:  docker build -t ho-connect-api .   Deployed on Fly.io (fly.toml); health check /health/ready.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
# The lockfile covers every workspace, so npm wants each one's package.json present.
COPY apps/dashboard/package.json ./apps/dashboard/package.json
COPY apps/mobile/package.json ./apps/mobile/package.json
RUN npm ci --workspace @hoc/api --include-workspace-root
RUN npm run build -w @hoc/api
RUN npm prune --omit=dev --workspace @hoc/api --include-workspace-root

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
# @hoc/* packages are bundled into dist/, so only npm dependencies are needed at run time.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
USER node
EXPOSE 4000
CMD ["node", "dist/index.js"]
