# Stage 1: build the React client.
FROM node:20-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
# Business details are baked into the client at build time (see client/.env.example).
ARG VITE_BUSINESS_LEGAL_NAME
ARG VITE_BUSINESS_ADDRESS
ARG VITE_BUSINESS_EMAIL
ARG VITE_BUSINESS_PHONE
ARG VITE_GRIEVANCE_OFFICER
ARG VITE_GRIEVANCE_EMAIL
ARG VITE_JURISDICTION
RUN npm run build

# Stage 2: run the server, which also serves client/dist.
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY server/package*.json ./server/
RUN npm ci --omit=dev --prefix server
COPY server/ ./server/
COPY --from=client /app/client/dist ./client/dist
USER node
EXPOSE 4000
CMD ["node", "server/src/index.js"]
