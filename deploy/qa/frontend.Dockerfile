FROM node:20-bookworm AS build
WORKDIR /app
COPY frontend/package.json frontend/yarn.lock* ./
RUN corepack enable && yarn install --frozen-lockfile
COPY frontend/ ./
ARG EXPO_PUBLIC_BACKEND_URL
ENV EXPO_PUBLIC_BACKEND_URL=$EXPO_PUBLIC_BACKEND_URL
RUN npx expo export --platform web --output-dir dist

FROM nginx:1.27-alpine
COPY deploy/qa/frontend.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
