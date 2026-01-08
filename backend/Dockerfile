FROM node:18-alpine

WORKDIR /app

# Change these lines to include the 'backend/' prefix
COPY backend/package*.json ./

RUN npm install

# Change this to copy the backend folder specifically
COPY backend/ .

EXPOSE 10000

CMD ["node", "server.js"]