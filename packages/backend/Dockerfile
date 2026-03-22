# Build stage
FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY packages/shared packages/shared
COPY packages/backend packages/backend

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build shared types first
RUN pnpm --filter @peer/shared build

# Build backend
RUN pnpm --filter @peer/backend build

# Production stage
FROM node:22-alpine AS production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files for production dependencies
COPY packages/backend/package.json packages/backend/pnpm-lock.yaml ./

# Install pnpm and production dependencies only
RUN corepack enable && corepack prepare pnpm@9 --activate

# Install production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=builder /app/packages/backend/dist ./dist
COPY --from=builder /app/packages/shared/dist ./node_modules/@peer/shared

# Copy data directory for SQLite
RUN mkdir -p /app/data && chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start command
CMD ["node", "dist/index.js"]
