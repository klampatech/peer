# Build stage
FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY packages/shared packages/shared
COPY packages/frontend packages/frontend

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build shared types first
RUN pnpm --filter @peer/shared build

# Build frontend
RUN pnpm --filter @peer/frontend build

# Production stage - serve with nginx
FROM nginx:alpine AS production

# Copy built frontend files
COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html

# Copy custom nginx config for SPA (handle React Router)
COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html

# Create nginx config for SPA routing
RUN echo 'server { \
    listen 80; \
    server_name localhost; \
    root /usr/share/nginx/html; \
    index index.html; \
    \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    \
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ { \
        expires 1y; \
        add_header Cache-Control "public, immutable"; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
