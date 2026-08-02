FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl curl
RUN curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.alpine.sh' | sh && apk add infisical
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY shared/ ./shared/
COPY packages/proto/ ./packages/proto/
RUN npm ci --workspace=backend --workspace=packages/proto --include=workspace=shared
RUN cd packages/proto && npx tsc -p tsconfig.json
# Lockfile nests @nestjs/platform-express under backend/node_modules while
# @nestjs/core is hoisted to root — NestJS's internal require() for the HTTP
# driver walks up from @nestjs/core's own location and never reaches the
# nested copy. Hoist it explicitly so the hybrid gRPC+HTTP bootstrap resolves.
RUN mkdir -p node_modules/@nestjs && ln -s /app/backend/node_modules/@nestjs/platform-express node_modules/@nestjs/platform-express
COPY backend/ ./backend/
# musl-specific sharp binary for Alpine — lockfile has the glibc build from Windows
RUN npm install --os=linux --libc=musl --cpu=x64 sharp
RUN cd backend && npx prisma generate
RUN cd backend && npx nest build stays-service
EXPOSE 5004
EXPOSE 8080
CMD ["sh", "-c", "if [ -n \"$INFISICAL_TOKEN\" ] && [ -n \"$INFISICAL_PROJECT_ID\" ]; then infisical run --projectId $INFISICAL_PROJECT_ID --env ${APP_ENV:-production} -- node ./backend/dist/apps/stays-service/src/main.js; else node ./backend/dist/apps/stays-service/src/main.js; fi"]
