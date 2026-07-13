FROM node:22-alpine AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim AS nju-cli
ARG TARGETARCH
ARG NJU_CLI_VERSION=1.4.6

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && case "${TARGETARCH}" in \
         amd64) asset="linux-x86_64"; checksum="5e639d8e7e3281e24d4557afff78c4cd1d26dd71079d751d83e266fb41709116" ;; \
         arm64) asset="linux-aarch64"; checksum="135e2ca2a840de9258179b1e801ba72fa9ef162f3053d07f0307103ae0964fc7" ;; \
         *) echo "unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
       esac \
    && curl -fL --retry 3 -o /tmp/nju-cli.tar.gz "https://github.com/nju-cli/nju-cli/releases/download/v${NJU_CLI_VERSION}/nju-cli-${asset}.tar.gz" \
    && mkdir /tmp/nju-cli \
    && tar -xzf /tmp/nju-cli.tar.gz -C /tmp/nju-cli \
    && binary="$(find /tmp/nju-cli -type f -name nju-cli | head -n 1)" \
    && echo "${checksum}  ${binary}" | sha256sum -c - \
    && install -m 0755 "${binary}" /usr/local/bin/nju-cli \
    && rm -rf /var/lib/apt/lists/* /tmp/nju-cli /tmp/nju-cli.tar.gz

FROM python:3.12-slim
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 --shell /usr/sbin/nologin app \
    && mkdir -p /app/state /app/reviews \
    && chown app:app /app/state

COPY --from=nju-cli /usr/local/bin/nju-cli /usr/local/bin/nju-cli
COPY pyproject.toml ./
COPY backend/ backend/
RUN pip install --no-cache-dir .

COPY data/reviews/merged_data.json reviews/merged_data.json
COPY --from=frontend /src/frontend/dist frontend/dist

ENV APP_ENV=production \
    COOKIE_SECURE=true \
    DATABASE_PATH=/app/state/nanyong.db \
    REVIEW_DATA_PATH=/app/reviews/merged_data.json \
    NJU_CLI_BIN=/usr/local/bin/nju-cli \
    HOME=/tmp \
    TMPDIR=/tmp \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3).read()"]
STOPSIGNAL SIGTERM
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
