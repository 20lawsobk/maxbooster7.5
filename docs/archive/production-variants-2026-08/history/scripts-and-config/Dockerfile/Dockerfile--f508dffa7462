FROM node:22

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    && curl https://sh.rustup.rs -sSf | sh -s -- -y --default-toolchain stable \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.cargo/bin:${PATH}"

COPY package*.json ./

RUN npm ci

COPY . .

RUN cd boosterstate && cargo build 2>&1

ENV NODE_ENV=development
ENV PORT=5000
ENV BOOSTERSTATE_PORT=9877

EXPOSE 5000 9877

CMD ["npm", "run", "dev"]
