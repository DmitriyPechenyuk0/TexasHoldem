ALTER TABLE "lobby_tables" ADD COLUMN "players" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "lobby_tables" ADD COLUMN "hands_played" integer DEFAULT 0 NOT NULL;