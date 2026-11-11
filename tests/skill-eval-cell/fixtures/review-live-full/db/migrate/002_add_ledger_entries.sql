CREATE TABLE ledger_entries (
  id BIGSERIAL PRIMARY KEY,
  invoice_id BIGINT NOT NULL,
  amount_cents BIGINT NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ledger_entries_invoice_idx ON ledger_entries (invoice_id);
