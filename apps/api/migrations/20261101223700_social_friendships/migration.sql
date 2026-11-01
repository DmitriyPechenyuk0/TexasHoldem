CREATE TABLE "social_friend_requests" (
	"from_id" uuid,
	"to_id" uuid,
	"sent_at" timestamp with time zone NOT NULL,
	CONSTRAINT "social_friend_requests_pkey" PRIMARY KEY("from_id","to_id")
);
--> statement-breakpoint
CREATE TABLE "social_friendships" (
	"user_id" uuid,
	"friend_id" uuid,
	"since" timestamp with time zone NOT NULL,
	CONSTRAINT "social_friendships_pkey" PRIMARY KEY("user_id","friend_id")
);
--> statement-breakpoint
CREATE INDEX "profile_profiles_username_index" ON "profile_profiles" ("username" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "social_friend_requests_to_id_index" ON "social_friend_requests" ("to_id");