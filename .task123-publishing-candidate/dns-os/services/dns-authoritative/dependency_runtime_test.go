package main

import (
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/miekg/dns"
)

func TestPatchedPGXParsesConfigWithoutConnecting(t *testing.T) {
	config, err := pgxpool.ParseConfig("postgres://fixture:fixture@localhost:5432/fixture?sslmode=require&pool_max_conns=2")
	if err != nil {
		t.Fatal(err)
	}
	if config.MaxConns != 2 || config.ConnConfig.Database != "fixture" || config.ConnConfig.TLSConfig == nil {
		t.Fatal("pgx configuration contract changed")
	}
	if _, err := pgxpool.ParseConfig("postgres://%zz"); err == nil {
		t.Fatal("malformed URI must fail")
	}
}

func TestRecordConstructionAndWireRoundtrip(t *testing.T) {
	rr := buildRR("example.invalid.", "A", 300, nil, "192.0.2.1")
	if rr == nil || rr.Header().Ttl != 300 {
		t.Fatal("valid record rejected")
	}
	message := new(dns.Msg)
	message.SetQuestion("example.invalid.", dns.TypeA)
	message.Answer = []dns.RR{rr}
	wire, err := message.Pack()
	if err != nil {
		t.Fatal(err)
	}
	var decoded dns.Msg
	if err := decoded.Unpack(wire); err != nil {
		t.Fatal(err)
	}
	if len(decoded.Answer) != 1 || decoded.Answer[0].String() != rr.String() {
		t.Fatal("wire roundtrip changed record")
	}
	if buildRR("example.invalid.", "A", 300, nil, "not-an-address") != nil {
		t.Fatal("invalid address accepted")
	}
}