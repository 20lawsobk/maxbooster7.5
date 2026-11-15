# dns-node — Standalone Nameserver Makefile
# Usage: make ns1 | make ns2 | make both | make stop

SHELL := /bin/bash
TSX   := ../node_modules/.bin/tsx
NODE  := node

.PHONY: ns1 ns2 both stop check ds-record zone-push

ns1:
	DNS_PORT=5353 DNS_SERVER_ROLE=ns1 HEALTH_PORT=5380 \
	DNSSEC_ENABLED=true GEODNS_ENABLED=true \
	$(TSX) src/index.ts

ns2:
	DNS_PORT=5354 DNS_SERVER_ROLE=ns2 HEALTH_PORT=5381 \
	DNSSEC_ENABLED=true GEODNS_ENABLED=true \
	$(TSX) src/index.ts

both:
	@echo "Starting ns1 (port 5353) and ns2 (port 5354) in background..."
	@DNS_PORT=5353 DNS_SERVER_ROLE=ns1 HEALTH_PORT=5380 DNSSEC_ENABLED=true GEODNS_ENABLED=true $(TSX) src/index.ts &
	@DNS_PORT=5354 DNS_SERVER_ROLE=ns2 HEALTH_PORT=5381 DNSSEC_ENABLED=true GEODNS_ENABLED=true $(TSX) src/index.ts &
	@echo "Both nodes started. Run 'make check' to verify."

stop:
	@pkill -f "dns-node" 2>/dev/null || true
	@echo "Stopped dns-node processes"

check:
	@echo "=== ns1 (5353) health ==="
	@curl -sf http://localhost:5380/health | python3 -m json.tool || echo "ns1 health: DOWN"
	@echo ""
	@echo "=== ns2 (5354) health ==="
	@curl -sf http://localhost:5381/health | python3 -m json.tool || echo "ns2 health: DOWN"
	@echo ""
	@echo "=== DNS probe (ns1) ==="
	@python3 ../scripts/dns-probe.py 5353 || echo "ns1 DNS: DOWN"
	@echo ""
	@echo "=== DNS probe (ns2) ==="
	@python3 ../scripts/dns-probe.py 5354 || echo "ns2 DNS: DOWN"

ds-record:
	@curl -sf http://localhost:5380/ds-record | python3 -m json.tool

zone-push:
	@echo "Triggering zone reload on all nodes..."
	@curl -sX POST http://localhost:5380/reload | python3 -m json.tool
	@curl -sX POST http://localhost:5381/reload | python3 -m json.tool
	@echo "Done."
