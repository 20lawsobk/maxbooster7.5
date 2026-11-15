-- Additive v2 commerce ledger. NO inferred opening balances or historical backfill.
CREATE TABLE commerce_journals (
 id text PRIMARY KEY, currency text NOT NULL, source text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE commerce_entries (
 journal_id text NOT NULL REFERENCES commerce_journals(id),
 line integer NOT NULL, account text NOT NULL, user_id text,
 amount_cents bigint NOT NULL, PRIMARY KEY(journal_id,line)
);
CREATE INDEX commerce_entries_account ON commerce_entries(user_id,account);
CREATE TABLE commerce_allocations (
 id text PRIMARY KEY, source_id text NOT NULL, user_id text NOT NULL,
 currency text NOT NULL, amount_cents bigint NOT NULL CHECK(amount_cents>=0),
 reversed_cents bigint NOT NULL DEFAULT 0 CHECK(reversed_cents>=0 AND reversed_cents<=amount_cents),
 drawn_cents bigint NOT NULL DEFAULT 0 CHECK(drawn_cents>=0 AND drawn_cents<=amount_cents),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(source_id,user_id)
);
CREATE TABLE commerce_operations (
 id text PRIMARY KEY, kind text NOT NULL, user_id text NOT NULL,
 currency text NOT NULL, amount_cents bigint NOT NULL CHECK(amount_cents>0),
 state text NOT NULL DEFAULT 'pending',
 payload jsonb NOT NULL, transfer_id text, provider_id text,
 lease_until timestamptz, lease_token text, attempts integer NOT NULL DEFAULT 0,
 error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commerce_operations_pending ON commerce_operations(state,lease_until);
CREATE TABLE commerce_draws (
 operation_id text NOT NULL REFERENCES commerce_operations(id),
 allocation_id text NOT NULL REFERENCES commerce_allocations(id),
 amount_cents bigint NOT NULL CHECK(amount_cents>0),
 compensated_cents_at_draw bigint NOT NULL DEFAULT 0,
 PRIMARY KEY(operation_id,allocation_id)
);
CREATE TABLE commerce_sources (
 id text PRIMARY KEY, kind text NOT NULL, payment_intent text UNIQUE,
 currency text NOT NULL, gross_cents bigint NOT NULL CHECK(gross_cents>0),
 fee_cents bigint NOT NULL CHECK(fee_cents>=0),
 tax_cents bigint NOT NULL DEFAULT 0 CHECK(tax_cents>=0),
 compensated_tax_cents bigint NOT NULL DEFAULT 0,
 refunded_cents bigint NOT NULL DEFAULT 0, disputed_cents bigint NOT NULL DEFAULT 0,
 pending_refund_cents bigint NOT NULL DEFAULT 0,
 compensated_cents bigint NOT NULL DEFAULT 0,
 metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE commerce_statements (
 statement_id text PRIMARY KEY, user_id text NOT NULL, currency text NOT NULL,
 payable_cents bigint NOT NULL, funded boolean NOT NULL DEFAULT false,
 details jsonb NOT NULL, funding_ref text UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE commerce_schedules (
 user_id text PRIMARY KEY, next_due timestamptz NOT NULL
);
-- Deferred constraint: every committed journal is balanced, including inserts
-- performed by code outside the repository.
CREATE FUNCTION commerce_check_journal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (SELECT COALESCE(sum(amount_cents),0) FROM commerce_entries WHERE journal_id=NEW.journal_id) <> 0 THEN
   RAISE EXCEPTION 'Unbalanced commerce journal %', NEW.journal_id;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER commerce_balanced_journal
 AFTER INSERT OR UPDATE ON commerce_entries DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION commerce_check_journal();
CREATE FUNCTION commerce_immutable_journal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Commerce journals are append-only; use a compensating journal'; END $$;
CREATE TRIGGER commerce_entries_immutable BEFORE UPDATE OR DELETE ON commerce_entries
 FOR EACH ROW EXECUTE FUNCTION commerce_immutable_journal();
CREATE TRIGGER commerce_journals_immutable BEFORE UPDATE OR DELETE ON commerce_journals
 FOR EACH ROW EXECUTE FUNCTION commerce_immutable_journal();