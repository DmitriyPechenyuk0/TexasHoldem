CREATE TABLE "chat_mutes" (
	"user_id" uuid,
	"muted_id" uuid,
	"muted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "chat_mutes_pkey" PRIMARY KEY("user_id","muted_id")
);
