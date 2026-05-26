# Build context: monorepo root (not backend/) — required for shared/ workspace in Wave 3
# Wave 3: per-microservice Dockerfiles live at backend/apps/<service>/Dockerfile

FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl curl

# Install Infisical CLI
RUN curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.alpine.sh' | sh \
    && apk add infisical

# Copy workspace manifests first (Docker layer cache)
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY shared/ ./shared/
COPY packages/ ./packages/

# Install production deps for backend workspace
RUN npm ci --workspace=backend --include=workspace=shared

# Install musl-specific sharp binary for Alpine (lock file has the glibc build from Windows)
RUN npm install --os=linux --libc=musl --cpu=x64 sharp

# Copy source
COPY backend/ ./backend/

# Generate Prisma client and compile TypeScript
RUN cd backend && npx prisma generate
RUN cd backend && npm run build

# Startup script: runs migrate deploy then starts the app
RUN chmod +x ./backend/start.sh

EXPOSE 3001

# Use Infisical if token is present, otherwise start directly with Railway env vars
CMD ["sh", "-c", "if [ -n \"$INFISICAL_TOKEN\" ] && [ -n \"$INFISICAL_PROJECT_ID\" ]; then infisical run --projectId $INFISICAL_PROJECT_ID --env ${APP_ENV:-production} -- /app/backend/start.sh; else /app/backend/start.sh; fi"]
