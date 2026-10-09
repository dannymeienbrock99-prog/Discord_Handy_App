FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0 DATA_DIR=/data
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --chown=node:node site-default.json ./site-default.json
COPY --chown=node:node site-default-images ./site-default-images
RUN apt-get update && apt-get install -y --no-install-recommends util-linux && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data && chown node:node /data && chmod 700 /data
USER node
EXPOSE 8080
VOLUME ["/data"]
ENTRYPOINT ["flock", "--exclusive", "--nonblock", "--no-fork", "/data/process.lock"]
CMD ["node", "src/index.mjs"]
