-- Invariant 4: the events table is APPEND-ONLY, enforced at the database, not by
-- convention. A BEFORE UPDATE OR DELETE trigger rejects mutation for ALL roles —
-- including the table owner — which REVOKE alone cannot guarantee. Corrections are
-- new events; the hash chain (prev_event_hash → event_hash) makes tampering detectable.
CREATE OR REPLACE FUNCTION regdelta_events_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'events is append-only (Invariant 4): % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER events_no_update_delete
BEFORE UPDATE OR DELETE ON "events"
FOR EACH ROW EXECUTE FUNCTION regdelta_events_append_only();
--> statement-breakpoint
-- Defence in depth: revoke mutation grants from the public role as well.
REVOKE UPDATE, DELETE ON "events" FROM PUBLIC;
