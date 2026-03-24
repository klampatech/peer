# Production stage only - built files are copied from build context
FROM node:22-alpine

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files first
COPY packages/backend/package.json ./

# Remove workspace dependency BEFORE npm install
RUN sed -i '/"@peer\/shared": "file:\.\.\/shared"/d' package.json

# Now install production dependencies
RUN npm install --omit=dev --ignore-scripts

# Copy @peer/shared AFTER npm install (so it doesn't get removed)
COPY packages/shared/dist ./node_modules/@peer/shared

# Copy built backend dist
COPY packages/backend/dist ./dist

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
