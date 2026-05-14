# Build context: monorepo root
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl curl
RUN curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.alpine.sh' | sh \
    && apk add infisical

COPY package*.json ./
COPY backend/package*.json ./backend/
COPY shared/ ./shared/
COPY packages/proto/ ./packages/proto/

RUN npm ci --workspace=backend --include=workspace=shared

COPY backend/ ./backend/
RUN cd backend && npx prisma generate
RUN cd backend && npx nest build auth-service 2>/dev/null || npx tsc -p apps/auth-service/tsconfig.json 2>/dev/null || true

EXPOSE 5001

CMD ["sh", "-c", "infisical run --projectId $INFISICAL_PROJECT_ID --env ${APP_ENV:-production} -- node --require ./backend/apps/auth-service/dist/main.js"]
