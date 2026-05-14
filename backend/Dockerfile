# Build context: monorepo root (not backend/) — required for shared/ workspace in Wave 3
# Wave 3: per-microservice Dockerfiles live at backend/apps/<service>/Dockerfile

FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl curl

# Install Infisical CLI
RUN curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.alpine.sh' | sh \
    && apk add infisical

# Copy workspace manifests first (Docker layer cache)
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY shared/ ./shared/

# Install production deps for backend workspace
RUN npm ci --workspace=backend --include=workspace=shared
# Rebuild sharp to ensure the correct platform-specific native binary (linuxmusl-x64) is installed
RUN cd backend && npm rebuild sharp

# Copy source
COPY backend/ ./backend/

# Generate Prisma client and compile TypeScript
RUN cd backend && npx prisma generate
RUN cd backend && npm run build

# Startup script: runs migrate deploy then starts the app
RUN chmod +x ./backend/start.sh

EXPOSE 3001

# Infisical injects all secrets; start.sh runs prisma migrate deploy then boots the app
CMD ["sh", "-c", "infisical run --projectId $INFISICAL_PROJECT_ID --env ${APP_ENV:-production} -- /app/backend/start.sh"]
