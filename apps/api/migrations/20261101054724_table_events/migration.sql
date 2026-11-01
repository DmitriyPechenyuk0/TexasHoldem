CREATE TABLE "table_events" (
	"global_position" bigserial PRIMARY KEY,
	"stream_id" text NOT NULL,
	"version" integer NOT NULL,
	"type" text NOT NULL,
	"schema_version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"metadata" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "table_events_stream_id_version_unique" UNIQUE("stream_id","version")
);
