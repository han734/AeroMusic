# Stage 1: Build Frontend and Bundle Server
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency configs
COPY package*.json ./
COPY tsconfig.json ./
COPY vite.config.ts ./

# Install dependencies (including devDependencies for build step)
RUN npm ci

# Copy source code and config assets
COPY src ./src
COPY public ./public
COPY server.ts ./server.ts

# Build frontend and bundle server
RUN npm run build

# Stage 2: Runtime Environment
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy package descriptors for reference
COPY package*.json ./

# Install ONLY production dependencies to keep container small
RUN npm ci --only=production

# Copy compiled files from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/public ./public

# Create empty directories for data storage
RUN mkdir -p data

EXPOSE 3000

# Start compiled server
CMD ["node", "dist-server/server.cjs"]
