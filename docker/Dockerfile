# syntax=docker/dockerfile:1

# Which workspace app to build: customer | vendor | admin
ARG APP=customer

# ---- base: pnpm + turbo ----
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat && corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# ---- prune: isolate the target app's workspace subset ----
FROM base AS pruner
ARG APP
RUN pnpm add -g turbo@2
COPY . .
RUN turbo prune "@e-luna/${APP}" --docker

# ---- installer: install deps + build ----
FROM base AS installer
ARG APP
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
# Prisma client must be generated before the Next.js build (db package)
RUN pnpm --filter "@e-luna/db" exec prisma generate
RUN pnpm --filter "@e-luna/${APP}" build

# ---- runner: minimal runtime with standalone output ----
FROM node:20-alpine AS runner
ARG APP
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Next.js standalone output for a monorepo places the server at apps/<app>/server.js
COPY --from=installer --chown=nextjs:nodejs /app/apps/${APP}/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=installer --chown=nextjs:nodejs /app/apps/${APP}/public ./apps/${APP}/public

USER nextjs
EXPOSE 3000
# APP is baked into the start path via a shell so the ARG expands at build time
ENV APP=${APP}
CMD ["sh", "-c", "node apps/${APP}/server.js"]
