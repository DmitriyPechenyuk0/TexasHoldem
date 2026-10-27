CREATE TABLE "profile_profiles" (
	"user_id" uuid PRIMARY KEY,
	"username" text NOT NULL UNIQUE,
	"nickname" text NOT NULL,
	"avatar_key" text,
	"locale" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Accounts created before this migration get the profile UserRegistered would have made.
INSERT INTO "profile_profiles" ("user_id", "username", "nickname", "locale", "created_at")
SELECT "id", "username", "username", "locale", "created_at" FROM "identity_users"
ON CONFLICT DO NOTHING;
