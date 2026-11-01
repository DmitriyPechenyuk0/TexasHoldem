CREATE TABLE "table_hand_decks" (
	"hand_id" text PRIMARY KEY,
	"table_id" text NOT NULL,
	"server_seed" text NOT NULL,
	"commitment" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revealed_at" timestamp with time zone
);
