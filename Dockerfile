# syntax = docker/dockerfile:experimental
FROM node:12-alpine as base
ARG GITHUB_TOKEN
ENV GITHUB_TOKEN=${GITHUB_TOKEN}
COPY package.json .
COPY yarn.lock .

RUN --mount=type=cache,target=cache \
    yarn install --frozen-lockfile

COPY . .

RUN yarn download-cli && \
    chmod +x docker-linux-amd64 && \
    yarn test
