CREATE TABLE "cli_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "coding_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"total_seconds" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coding_stats_total_nonneg_chk" CHECK ("coding_stats"."total_seconds" >= 0)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "name" varchar(100);--> statement-breakpoint
ALTER TABLE "cli_tokens" ADD CONSTRAINT "cli_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coding_stats" ADD CONSTRAINT "coding_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cli_tokens_token_hash_uq" ON "cli_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "cli_tokens_one_active_per_user_uq" ON "cli_tokens" USING btree ("user_id") WHERE "cli_tokens"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "cli_tokens_user_idx" ON "cli_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coding_stats_user_id_uq" ON "coding_stats" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "coding_stats_total_seconds_idx" ON "coding_stats" USING btree ("total_seconds" DESC NULLS LAST);
--> statement-breakpoint
-- DATA CARRY-OVER (hand-written; runs while the legacy tables still exist).
-- 1) Every existing user gets one coding_stats row; the total is the sum of the seconds the old
--    server-side session system had already credited, so no one loses their leaderboard position.
INSERT INTO "coding_stats" ("user_id", "total_seconds")
SELECT u."id", COALESCE(SUM(s."total_active_seconds"), 0)
FROM "users" u
LEFT JOIN "coding_sessions" s ON s."user_id" = u."id"
GROUP BY u."id";
--> statement-breakpoint
-- 2) Keep each user's most recent ACTIVE CLI token working (same ctt_ format, same SHA-256 hash).
--    The new model allows a single active token per user; older extra tokens are not migrated.
INSERT INTO "cli_tokens" ("user_id", "token_hash", "created_at")
SELECT DISTINCT ON ("user_id") "user_id", "token_hash", "created_at"
FROM "api_tokens"
WHERE "revoked_at" IS NULL
ORDER BY "user_id", "created_at" DESC;
