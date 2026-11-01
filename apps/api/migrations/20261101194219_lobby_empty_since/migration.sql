ALTER TABLE "lobby_tables" ADD COLUMN "empty_since" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "lobby_tables_status_empty_since_index" ON "lobby_tables" ("status","empty_since");