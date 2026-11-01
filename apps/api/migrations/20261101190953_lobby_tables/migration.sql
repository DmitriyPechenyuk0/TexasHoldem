CREATE TABLE "lobby_tables" (
	"id" uuid PRIMARY KEY,
	"name" text NOT NULL,
	"preset_id" text NOT NULL,
	"max_seats" integer NOT NULL,
	"visibility" text NOT NULL,
	"creator_id" uuid NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "lobby_tables_creator_id_status_index" ON "lobby_tables" ("creator_id","status");