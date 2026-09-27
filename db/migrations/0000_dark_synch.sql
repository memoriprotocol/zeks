CREATE TABLE IF NOT EXISTS "price_history" (
	"symbol" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"price" numeric(40, 18) NOT NULL,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "price_history_symbol_timestamp_uq" ON "price_history" USING btree ("symbol","timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_history_symbol_timestamp_idx" ON "price_history" USING btree ("symbol","timestamp");