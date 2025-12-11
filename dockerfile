# Dockerfile
# Match your exact Node version: v24.11.0
FROM node:24.11.0-alpine

# Install dependencies needed for some packages
RUN apk add --no-cache libc6-compat git python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install exact dependencies (matches your package-lock.json)
RUN npm ci

# Copy the rest of the application
COPY . .

# Build the Next.js application
RUN npm run build

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]