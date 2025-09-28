# Use the official Node.js 20 Alpine image
FROM node:20-alpine

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S base -u 1001

# Set working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies (tsx needed to run TypeScript natively)
RUN npm ci && npm cache clean --force

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./

# Change ownership to non-root user
RUN chown -R base:nodejs /app
USER base

# Set the entrypoint to run TypeScript natively
ENTRYPOINT ["npx", "tsx", "src/index.ts"]

# Default command (shows help if no arguments provided)
CMD ["--help"]