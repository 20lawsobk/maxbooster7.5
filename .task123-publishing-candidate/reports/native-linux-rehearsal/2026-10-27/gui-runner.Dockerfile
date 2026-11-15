FROM maxbooster-readiness-base:local
RUN --mount=type=secret,id=proxy_ca,required=true,mode=0444 \
    apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca update && \
    apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca install -y --no-install-recommends \
      xvfb xauth libgtk-3-0 libnss3 libgbm1 libasound2 libatk-bridge2.0-0 \
      libxss1 libxcomposite1 libxdamage1 libxrandr2 libxkbcommon0 libcups2 \
      fonts-dejavu-core && \
    rm -rf /var/lib/apt/lists/*
