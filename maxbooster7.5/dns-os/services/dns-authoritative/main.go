package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/miekg/dns"
)

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL environment variable is required")
	}

	dnsPort := os.Getenv("DNS_PORT")
	if dnsPort == "" {
		dnsPort = "53"
	}
	addr := ":" + dnsPort

	refreshInterval := 5 * time.Second
	if v := os.Getenv("ZONE_REFRESH_INTERVAL"); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			refreshInterval = d
		}
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer pool.Close()

	store := NewDBZoneStore(pool)

	// Initial load — fail fast if DB is unreachable
	if err := store.Refresh(ctx); err != nil {
		log.Fatalf("initial zone refresh: %v", err)
	}
	log.Printf("[dns] initial zone refresh complete")

	go store.RunRefresher(ctx, refreshInterval)

	handler := &DNSServer{Store: store}

	mux := dns.NewServeMux()
	mux.HandleFunc(".", handler.ServeDNS)

	udpSrv := &dns.Server{Addr: addr, Net: "udp", Handler: mux}
	tcpSrv := &dns.Server{Addr: addr, Net: "tcp", Handler: mux}

	go func() {
		log.Printf("[dns] UDP server listening on %s", addr)
		if err := udpSrv.ListenAndServe(); err != nil {
			log.Fatalf("udp server: %v", err)
		}
	}()

	go func() {
		log.Printf("[dns] TCP server listening on %s", addr)
		if err := tcpSrv.ListenAndServe(); err != nil {
			log.Fatalf("tcp server: %v", err)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	log.Println("[dns] shutting down")
	shutCtx, shutCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutCancel()
	_ = udpSrv.ShutdownContext(shutCtx)
	_ = tcpSrv.ShutdownContext(shutCtx)
}
