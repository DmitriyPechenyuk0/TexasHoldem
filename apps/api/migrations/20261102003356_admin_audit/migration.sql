CREATE TABLE "admin_audit" (
	"id" uuid PRIMARY KEY,
	"admin_id" uuid,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"details" jsonb DEFAULT '{}' NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "admin_audit_at_index" ON "admin_audit" ("at");