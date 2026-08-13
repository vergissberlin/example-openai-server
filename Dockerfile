# Build stage: compiles TypeScript with the dev dependencies present.
FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable

# pnpm-workspace.yaml carries the settings, not just workspace members —
# pnpm 11 no longer reads them from package.json. Without it here, the install
# inside the image does not see the esbuild build-script approval and fails.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

# Runtime stage: production dependencies and compiled output only, so the
# image carries neither the toolchain nor the sources.
FROM node:22-alpine AS runtime

WORKDIR /app
RUN corepack enable

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod && pnpm store prune

COPY --from=build /app/dist ./dist

# The node image ships an unprivileged `node` user; running as root in a
# container that talks to the internet buys nothing.
USER node

EXPOSE 3000

# Uses the app's own health endpoint, which answers without calling upstream.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
