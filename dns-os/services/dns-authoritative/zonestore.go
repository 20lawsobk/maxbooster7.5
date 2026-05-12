package main

import (
        "context"
        "fmt"
        "strconv"
        "strings"
        "sync"
        "time"

        "github.com/jackc/pgx/v5/pgxpool"
        "github.com/miekg/dns"
)

// RRSet holds all resource records for a single (name, type) pair.
type RRSet struct {
        TTL uint32
        RRs []dns.RR
}

// Zone is a single authoritative zone loaded from Postgres.
type Zone struct {
        Name    string            // FQDN with trailing dot
        Serial  uint32
        Records map[string]*RRSet // key: "<fqdn_lower>|<QTYPE_str>"
}

// ZoneStore is the interface the DNS server reads from.
type ZoneStore interface {
        GetZone(name string) (*Zone, bool)
}

// DBZoneStore implements ZoneStore backed by the main app's dns_zones /
// dns_zone_records PostgreSQL tables (same Neon DB as the Max Booster app).
type DBZoneStore struct {
        db    *pgxpool.Pool
        mu    sync.RWMutex
        zones map[string]*Zone // key: fqdn lowercase with trailing dot
}

// NewDBZoneStore creates a new DBZoneStore backed by the given pool.
func NewDBZoneStore(db *pgxpool.Pool) *DBZoneStore {
        return &DBZoneStore{
                db:    db,
                zones: make(map[string]*Zone),
        }
}

// GetZone returns the best matching zone for the given DNS name.
func (s *DBZoneStore) GetZone(name string) (*Zone, bool) {
        s.mu.RLock()
        defer s.mu.RUnlock()
        key := strings.ToLower(dns.Fqdn(name))
        z, ok := s.zones[key]
        return z, ok
}

// Refresh re-loads all active zones and their records from the main app's
// dns_zones / dns_zone_records PostgreSQL tables.
func (s *DBZoneStore) Refresh(ctx context.Context) error {
        // ── 1. Load active zones from dns_zones ────────────────────────────────
        // dns_zones uses 'domain' (not 'name') and has no 'serial' column —
        // we derive a monotone serial from updated_at epoch seconds.
        zoneRows, err := s.db.Query(ctx, `
                SELECT id,
                       domain AS name,
                       EXTRACT(EPOCH FROM COALESCE(updated_at, created_at))::bigint AS serial
                FROM   dns_zones
                WHERE  status = 'active'
        `)
        if err != nil {
                return fmt.Errorf("load dns_zones: %w", err)
        }
        defer zoneRows.Close()

        type zoneRow struct {
                ID     string
                Name   string
                Serial uint32
        }
        var zones []zoneRow
        for zoneRows.Next() {
                var r zoneRow
                var serial int64
                if err := zoneRows.Scan(&r.ID, &r.Name, &serial); err != nil {
                        return fmt.Errorf("scan dns_zones: %w", err)
                }
                r.Serial = uint32(serial)
                zones = append(zones, r)
        }
        zoneRows.Close()

        // ── 2. Build in-memory map ─────────────────────────────────────────────
        tmp := make(map[string]*Zone, len(zones))
        for _, z := range zones {
                fqdn := strings.ToLower(dns.Fqdn(z.Name))
                tmp[fqdn] = &Zone{
                        Name:    fqdn,
                        Serial:  z.Serial,
                        Records: make(map[string]*RRSet),
                }
        }

        // ── 3. Load records from dns_zone_records ──────────────────────────────
        // The main app uses column 'value' where the dns-os schema used 'data'.
        // ttl is nullable in dns_zone_records — default to 3600 when NULL.
        recRows, err := s.db.Query(ctx, `
                SELECT z.domain              AS zone_name,
                       r.name                AS rec_name,
                       upper(r.type)         AS rtype,
                       COALESCE(r.ttl, 3600) AS ttl,
                       r.priority,
                       r.value               AS data
                FROM   dns_zone_records r
                JOIN   dns_zones        z ON z.id = r.zone_id
                WHERE  z.status = 'active'
        `)
        if err != nil {
                return fmt.Errorf("load dns_zone_records: %w", err)
        }
        defer recRows.Close()

        for recRows.Next() {
                var zoneName, recName, rtype, data string
                var ttl int
                var priority *int
                if err := recRows.Scan(&zoneName, &recName, &rtype, &ttl, &priority, &data); err != nil {
                        return fmt.Errorf("scan dns_zone_records: %w", err)
                }

                zoneKey := strings.ToLower(dns.Fqdn(zoneName))
                z, ok := tmp[zoneKey]
                if !ok {
                        continue
                }

                // Resolve the record FQDN from the label + zone apex.
                // '@' and '' both mean the zone apex.
                var fqdn string
                switch strings.ToLower(recName) {
                case "@", "":
                        fqdn = dns.Fqdn(zoneName)
                default:
                        fqdn = dns.Fqdn(recName + "." + zoneName)
                }
                fqdn = strings.ToLower(fqdn)

                key := fqdn + "|" + rtype

                rrset, exists := z.Records[key]
                if !exists {
                        rrset = &RRSet{TTL: uint32(ttl)}
                        z.Records[key] = rrset
                }

                rr := buildRR(fqdn, rtype, uint32(ttl), priority, data)
                if rr != nil {
                        rrset.RRs = append(rrset.RRs, rr)
                }
        }

        // ── 4. Swap in atomically ──────────────────────────────────────────────
        s.mu.Lock()
        s.zones = tmp
        s.mu.Unlock()

        return nil
}

// RunRefresher calls Refresh on a ticker until ctx is done.
func (s *DBZoneStore) RunRefresher(ctx context.Context, interval time.Duration) {
        ticker := time.NewTicker(interval)
        defer ticker.Stop()
        for {
                select {
                case <-ticker.C:
                        if err := s.Refresh(ctx); err != nil {
                                // Log but do not exit — serve stale data until DB recovers
                                fmt.Printf("[zonestore] refresh error: %v\n", err)
                        }
                case <-ctx.Done():
                        return
                }
        }
}

// buildRR constructs a dns.RR from raw record fields.
func buildRR(fqdn, rtype string, ttl uint32, priority *int, data string) dns.RR {
        var raw string
        prio := 10
        if priority != nil {
                prio = *priority
        }

        switch rtype {
        case "A":
                raw = fmt.Sprintf("%s %d IN A %s", fqdn, ttl, data)
        case "AAAA":
                raw = fmt.Sprintf("%s %d IN AAAA %s", fqdn, ttl, data)
        case "CNAME":
                raw = fmt.Sprintf("%s %d IN CNAME %s", fqdn, ttl, dns.Fqdn(data))
        case "NS":
                raw = fmt.Sprintf("%s %d IN NS %s", fqdn, ttl, dns.Fqdn(data))
        case "MX":
                raw = fmt.Sprintf("%s %d IN MX %d %s", fqdn, ttl, prio, dns.Fqdn(data))
        case "TXT":
                raw = fmt.Sprintf("%s %d IN TXT %s", fqdn, ttl, strconv.Quote(data))
        case "CAA":
                // data format: "0 issue \"letsencrypt.org\"" or "0 issuewild \"letsencrypt.org\""
                raw = fmt.Sprintf("%s %d IN CAA %s", fqdn, ttl, data)
        case "PTR":
                raw = fmt.Sprintf("%s %d IN PTR %s", fqdn, ttl, dns.Fqdn(data))
        case "SOA":
                // data format: "ns1.max-booster.com. hostmaster.max-booster.com. 2026051201 3600 900 604800 60"
                raw = fmt.Sprintf("%s %d IN SOA %s", fqdn, ttl, data)
        case "SRV":
                // data format: "priority weight port target" — all four fields
                raw = fmt.Sprintf("%s %d IN SRV %s", fqdn, ttl, data)
        default:
                return nil
        }

        rr, err := dns.NewRR(raw)
        if err != nil {
                fmt.Printf("[zonestore] buildRR error (%s %s): %v\n", rtype, fqdn, err)
                return nil
        }
        return rr
}
