FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o dns-authoritative .

FROM scratch
COPY --from=builder /app/dns-authoritative /dns-authoritative
EXPOSE 53/udp
EXPOSE 53/tcp
ENTRYPOINT ["/dns-authoritative"]
