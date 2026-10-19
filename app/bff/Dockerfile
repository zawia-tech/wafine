# BFF Dockerfile - Multi-stage build for Bun
FROM oven/bun:1.4-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source
COPY src/ ./src/
COPY tsconfig.json ./

# Build
RUN bun run build

# Production stage
FROM oven/bun:1.4-alpine AS runner

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Expose port
EXPOSE 4000

# Health check. oven/bun:*-alpine ships wget and nc but NOT curl, so `curl -f` here exits
# 127 ("not found") and the container never leaves `starting`. wget exits 0 on 2xx and
# non-zero on 4xx/5xx or connection failure, so it is a correct probe. 127.0.0.1, not
# `localhost`: busybox wget may resolve localhost to ::1 while Bun listens on IPv4.
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:4000/health || exit 1

# Run
CMD ["bun", "run", "dist/index.js"]