FROM node:22-slim AS base
WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

COPY . .

# Data directory for the SQLite database. Mount a persistent volume here
# in production (see deploy/README.md) so case data survives restarts.
RUN mkdir -p /app/data
VOLUME ["/app/data"]

ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV PORT=3000

EXPOSE 3000

# Run as a non-root user
RUN useradd --uid 1001 --create-home appuser && chown -R appuser /app
USER appuser

CMD ["node", "server.js"]
