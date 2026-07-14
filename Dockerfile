FROM node:20-alpine

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Install backend dependencies
COPY backend/package.json backend/package-lock.json* ./backend/
COPY backend/prisma/ ./backend/prisma/
RUN cd backend && npm ci --omit=dev

# Copy application code
COPY backend ./backend
COPY frontend ./frontend
COPY docker/start.js ./start.js

WORKDIR /app/backend

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000
ENV DATABASE_URL="file:./data/prod.db"
ENV CLIENT_ORIGIN="https://tajeweed-v2-0.onrender.com"

RUN mkdir -p data uploads && npx prisma generate

EXPOSE 4000

CMD ["node", "/app/start.js"]
