# Use the official Node.js 20 Alpine image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies (tsx needed to run TypeScript natively)
RUN npm ci && npm cache clean --force

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./

# Set the entrypoint to run TypeScript natively
ENTRYPOINT ["npx", "tsx", "src/index.ts"]

# Default command (shows help if no arguments provided)
CMD ["help"]