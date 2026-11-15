package main

import (
        "fmt"
        "log"
        "strings"

        "github.com/miekg/dns"
)

// DNSServer handles incoming DNS queries.
type DNSServer struct {
        Store ZoneStore
}

// ServeDNS implements dns.Handler.
func (s *DNSServer) ServeDNS(w dns.ResponseWriter, r *dns.Msg) {
        msg := new(dns.Msg)
        msg.SetReply(r)
        msg.Authoritative = true
        msg.RecursionAvailable = false

        if len(r.Question) == 0 {
                msg.Rcode = dns.RcodeFormatError
                _ = w.WriteMsg(msg)
                return
        }

        q := r.Question[0]
        qName := strings.ToLower(dns.Fqdn(q.Name))
        qType := q.Qtype

        log.Printf("[dns] query type=%s name=%s", dns.TypeToString[qType], qName)

        zone := s.findBestZone(qName)
        if zone == nil {
                msg.Rcode = dns.RcodeRefused
                _ = w.WriteMsg(msg)
                return
        }

        // Add SOA to Authority section for every response in our zone
        soaKey := strings.ToLower(zone.Name) + "|SOA"
        if soaRRSet, ok := zone.Records[soaKey]; ok {
                msg.Ns = append(msg.Ns, soaRRSet.RRs...)
        }

        key := fmt.Sprintf("%s|%s", qName, dns.TypeToString[qType])
        rrset, found := zone.Records[key]

        if found {
                msg.Answer = append(msg.Answer, rrset.RRs...)
                msg.Rcode = dns.RcodeSuccess
        } else {
                // RFC 4592 wildcard synthesis: check *.zone for the queried type.
                // e.g. query for artist.max-booster.com → look up *.max-booster.com.|A
                wildcardKey := fmt.Sprintf("*.%s|%s", zone.Name, dns.TypeToString[qType])
                if wrrset, wfound := zone.Records[wildcardKey]; wfound {
                        for _, rr := range wrrset.RRs {
                                clone := dns.Copy(rr)
                                clone.Header().Name = qName // synthesize with the actual queried name
                                msg.Answer = append(msg.Answer, clone)
                        }
                        msg.Rcode = dns.RcodeSuccess
                } else if !s.nameExistsInZone(zone, qName) && !s.wildcardCoversName(zone) {
                        // Name genuinely does not exist and no wildcard covers it
                        msg.Rcode = dns.RcodeNameError
                } else {
                        // Name exists (or is covered by wildcard) but not this record type: NODATA
                        msg.Rcode = dns.RcodeSuccess
                }
        }

        if err := w.WriteMsg(msg); err != nil {
                log.Printf("[dns] write error: %v", err)
        }
}

// findBestZone walks the qName labels from most-specific to least-specific
// to find the longest matching zone (RFC 1034 §4.3.2 "best match").
func (s *DNSServer) findBestZone(qName string) *Zone {
        labels := dns.SplitDomainName(qName)
        if labels == nil {
                return nil
        }
        for i := 0; i < len(labels); i++ {
                candidate := strings.ToLower(dns.Fqdn(strings.Join(labels[i:], ".")))
                if z, ok := s.Store.GetZone(candidate); ok {
                        return z
                }
        }
        return nil
}

// nameExistsInZone checks whether any record with the given FQDN exists
// in the zone (regardless of type).
func (s *DNSServer) nameExistsInZone(zone *Zone, fqdn string) bool {
        prefix := strings.ToLower(fqdn) + "|"
        for key := range zone.Records {
                if strings.HasPrefix(key, prefix) {
                        return true
                }
        }
        return false
}

// wildcardCoversName returns true if the zone has any wildcard (*.zone) record.
// Used to decide NXDOMAIN vs NODATA when a specific type query misses.
func (s *DNSServer) wildcardCoversName(zone *Zone) bool {
        // zone.Name already has a trailing dot, e.g. "max-booster.com."
        prefix := "*." + zone.Name + "|"
        for key := range zone.Records {
                if strings.HasPrefix(key, prefix) {
                        return true
                }
        }
        return false
}
