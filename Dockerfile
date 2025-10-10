ARG NODE_VERSION=22.20.0
ARG NODE_TEST_VERSION=22.20.0

FROM node:${NODE_VERSION}-alpine3.21 AS base
RUN apk add --no-cache \
      docker \
      openjdk11 \
      make


FROM base AS install-base
WORKDIR /project
COPY . .
RUN npm install

FROM install-base AS build
RUN npm run build

FROM build AS test-build
ENV DOCKER_HOST=tcp://host.docker.internal:2375
RUN npm test

FROM build AS lint
ENV DOCKER_HOST=tcp://host.docker.internal:2375
RUN npm run lint

FROM node:${NODE_TEST_VERSION}-alpine3.21 AS test-integration-build
WORKDIR /workspace
ENV DOCKER_HOST=tcp://host.docker.internal:2375
COPY --link --from=build /project                               node-sdk
COPY --link --from=build /project/test-integration/cjs-project  cjs-project
COPY --link --from=build /project/test-integration/esm-project  esm-project
RUN cd cjs-project && \
    npm install ../node-sdk && \
    npm install && \
    npm test
RUN cd esm-project && \
    npm install ../node-sdk && \
    npm install && \
    npm test

FROM scratch AS dist
COPY --link --from=build /project/dist /

FROM scratch AS types
COPY --link --from=build /project/lib/types /

FROM scratch AS test
COPY --link --from=test-build /project/out/test /

FROM scratch AS test-integration
COPY --link --from=test-integration-build /workspace/cjs-project/junit.xml /cjs-project.junit.xml
COPY --link --from=test-integration-build /workspace/esm-project/junit.xml /esm-project.junit.xml