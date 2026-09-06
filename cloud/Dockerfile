FROM node:22.15.0-bookworm-slim AS console
WORKDIR /src/cloud/console
COPY cloud/console/package*.json ./
RUN npm ci
COPY cloud/console/ ./
RUN npm run build

FROM golang:1.26.8-bookworm AS api
WORKDIR /src
COPY sdk/go/ ./sdk/go/
COPY cloud/api/ ./cloud/api/
WORKDIR /src/cloud/api
RUN go mod download
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/soroticket-cloud .

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data /app/console && chown 65532:65532 /data
COPY --from=api /out/soroticket-cloud /app/soroticket-cloud
COPY --from=console /src/cloud/console/dist /app/console
USER 65532:65532
ENV SDCLOUD_ADDR=0.0.0.0:8787 SOROTICKET_DATA=/data SOROTICKET_CONSOLE_DIR=/app/console
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD ["/app/soroticket-cloud", "healthcheck"]
ENTRYPOINT ["/app/soroticket-cloud"]
