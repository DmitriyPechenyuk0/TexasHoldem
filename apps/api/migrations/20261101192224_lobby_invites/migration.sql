ALTER TABLE "lobby_tables" ADD COLUMN "invite_code" text;--> statement-breakpoint
ALTER TABLE "lobby_tables" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "lobby_tables" ADD CONSTRAINT "lobby_tables_invite_code_key" UNIQUE("invite_code");