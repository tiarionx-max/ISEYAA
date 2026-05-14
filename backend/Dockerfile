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

# Copy source
COPY backend/ ./backend/

# Generate Prisma client and compile TypeScript
RUN cd backend && npx prisma generate
RUN cd backend && npm run build

EXPOSE 3001

# Infisical injects all secrets before Node starts
# Only INFISICAL_TOKEN and INFISICAL_PROJECT_ID need to be set in Railway
CMD ["sh", "-c", "infisical run --projectId $INFISICAL_PROJECT_ID --env ${APP_ENV:-production} -- node --require ./backend/dist/instrumentation.js ./backend/dist/main.js"]
