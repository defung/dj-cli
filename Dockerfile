FROM node:22-trixie-slim AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies
RUN npm ci && npm cache clean --force

# Copy compile/build configs
COPY build*.js *config.json ./

# Copy source code
COPY src ./src

RUN npm run build:all

FROM debian:trixie-slim AS final

COPY --from=builder /app/dist/dj /bin/dj

ENTRYPOINT ["dj"]

# Default command (shows help if no arguments provided)
CMD ["--help"]
