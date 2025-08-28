# -------- Base --------
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

# -------- Deps (dev+prod) --------
FROM base AS deps
COPY package*.json ./
RUN npm ci

# -------- Build (generate Prisma + build Remix) --------
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma
# Generate Prisma client for alpine (musl)
RUN npx prisma generate
# Copy rest and build (uses your "remix vite:build" script)
COPY . .
RUN npm run build

# -------- Runtime (prod) --------
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app

# Install only prod deps
COPY package*.json ./
RUN npm ci --omit=dev

# Bring over generated Prisma client/binaries from build image
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client

# App artifacts
COPY --from=build /app/build ./build
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma

EXPOSE 8080
CMD ["npm", "run", "start"]
