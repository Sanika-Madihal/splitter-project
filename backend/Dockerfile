FROM node:18-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm install
# This copies BOTH backend and frontend into /app
COPY . . 
EXPOSE 10000
CMD ["node", "backend/server.js"]