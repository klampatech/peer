# Build stage
FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Build args for production URL
ARG VITE_API_URL=https://localhost
ENV VITE_API_URL=$VITE_API_URL

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY packages/shared packages/shared
COPY packages/frontend packages/frontend

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build shared types first
RUN pnpm --filter @peer/shared build

# Build frontend with explicit API URL
RUN pnpm --filter @peer/frontend build

# Production stage - serve with nginx
FROM nginx:alpine AS production

# Copy built frontend files
COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html

# Copy nginx config for SPA (handles React Router fallback + ACME challenge + gzip + security headers)
COPY nginx-frontend.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
