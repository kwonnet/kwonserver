# ONNX Runtime requires glibc; Alpine's musl cannot load its native bindings.
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates libgomp1 \
    && rm -rf /var/lib/apt/lists/*

FROM base AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY prisma ./prisma
COPY src ./src
COPY scripts ./scripts
COPY templates ./templates
# Generates a client for this image and compiles the app + seed; no database writes.
RUN npm run build
RUN npm prune --omit=dev

FROM base AS production
WORKDIR /app
RUN groupadd --system kwonserver && useradd --system --gid kwonserver --create-home kwonserver
ENV NODE_ENV=production PORT=8000
COPY --from=builder --chown=kwonserver:kwonserver /app/node_modules ./node_modules
COPY --from=builder --chown=kwonserver:kwonserver /app/dist ./dist
COPY --from=builder --chown=kwonserver:kwonserver /app/dist-seed ./dist-seed
COPY --from=builder --chown=kwonserver:kwonserver /app/prisma ./prisma
COPY --from=builder --chown=kwonserver:kwonserver /app/scripts ./scripts
COPY --from=builder --chown=kwonserver:kwonserver /app/templates ./templates
COPY --from=builder --chown=kwonserver:kwonserver /app/package.json ./package.json
RUN mkdir -p /app/model-cache && chown kwonserver:kwonserver /app/model-cache
USER kwonserver
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
STOPSIGNAL SIGTERM
# Run `npm run db:deploy` once as the release step before starting replicas.
CMD ["node", "-r", "./scripts/register-paths.cjs", "dist/index.js"]
