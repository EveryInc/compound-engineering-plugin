The importer reads the manifest first — the schema check runs before any row is touched. It rejects a row when the id is missing, the timestamp is malformed, or the currency code is unknown.
