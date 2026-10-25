# Build from the repo root: docker build -f integrations/docker-plugin/Dockerfile -t IMAGE .
FROM node:22-alpine
RUN apk add --no-cache curl
WORKDIR /plugin
COPY integrations/docker-plugin/src ./src
COPY integrations/gate/grid-aware-gate.sh /usr/local/bin/grid-aware-gate
RUN chmod +x /usr/local/bin/grid-aware-gate
ENTRYPOINT ["node", "/plugin/src/main.mjs"]
