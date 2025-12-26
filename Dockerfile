FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --production

# Copy built files
COPY dist/ ./dist/

# Run the server
CMD ["node", "dist/index.js"]
