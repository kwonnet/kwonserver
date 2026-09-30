FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY prisma ./prisma
COPY src ./src
COPY scripts ./scripts
# Generates a client for this image and compiles the app + seed; no database writes.
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine AS production
WORKDIR /app
RUN apk add --no-cache openssl && addgroup -S kwonserver && adduser -S kwonserver -G kwonserver
ENV NODE_ENV=production PORT=8000
COPY --from=builder --chown=kwonserver:kwonserver /app/node_modules ./node_modules
COPY --from=builder --chown=kwonserver:kwonserver /app/dist ./dist
COPY --from=builder --chown=kwonserver:kwonserver /app/dist-seed ./dist-seed
COPY --from=builder --chown=kwonserver:kwonserver /app/prisma ./prisma
COPY --from=builder --chown=kwonserver:kwonserver /app/scripts ./scripts
COPY --from=builder --chown=kwonserver:kwonserver /app/package.json ./package.json
USER kwonserver
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
STOPSIGNAL SIGTERM
# Run `npm run db:deploy` once as the release step before starting replicas.
CMD ["node", "-r", "./scripts/register-paths.cjs", "dist/index.js"]
