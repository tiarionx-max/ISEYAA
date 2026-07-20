FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl curl
RUN curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.alpine.sh' | sh && apk add infisical
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY shared/ ./shared/
COPY packages/proto/ ./packages/proto/
RUN npm ci --workspace=backend --workspace=packages/proto
COPY backend/ ./backend/
RUN cd backend && npx prisma generate
RUN cd backend && npx nest build delivery-otp-service
EXPOSE 5012
EXPOSE 8080
CMD ["sh", "-c", "infisical run --projectId $INFISICAL_PROJECT_ID --env ${APP_ENV:-production} -- node --require ./backend/dist/src/instrumentation.js ./backend/dist/apps/delivery-otp-service/src/main.js"]
