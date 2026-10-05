CREATE TYPE "public"."coding_session_status" AS ENUM('active', 'ended', 'expired');--> statement-breakpoint
CREATE TABLE "activity_heartbeats" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "activity_heartbeats_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"credited_seconds" integer NOT NULL,
	CONSTRAINT "activity_heartbeats_credit_pos_chk" CHECK ("activity_heartbeats"."credited_seconds" > 0)
);
--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(64) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"token_prefix" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "coding_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "coding_session_status" DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_heartbeat_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"total_active_seconds" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "coding_sessions_total_nonneg_chk" CHECK ("coding_sessions"."total_active_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(32) NOT NULL,
	"email" varchar(254) NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_lowercase_chk" CHECK ("users"."email" = lower("users"."email"))
);
--> statement-breakpoint
ALTER TABLE "activity_heartbeats" ADD CONSTRAINT "activity_heartbeats_session_id_coding_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."coding_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_heartbeats" ADD CONSTRAINT "activity_heartbeats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coding_sessions" ADD CONSTRAINT "coding_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_heartbeats_session_received_idx" ON "activity_heartbeats" USING btree ("session_id","received_at");--> statement-breakpoint
CREATE INDEX "activity_heartbeats_user_received_idx" ON "activity_heartbeats" USING btree ("user_id","received_at");--> statement-breakpoint
CREATE INDEX "activity_heartbeats_received_user_credit_idx" ON "activity_heartbeats" USING btree ("received_at","user_id","credited_seconds");--> statement-breakpoint
CREATE UNIQUE INDEX "api_tokens_token_hash_uq" ON "api_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "api_tokens_user_created_idx" ON "api_tokens" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "coding_sessions_user_started_idx" ON "coding_sessions" USING btree ("user_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "coding_sessions_one_active_per_user_uq" ON "coding_sessions" USING btree ("user_id") WHERE "coding_sessions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "coding_sessions_active_heartbeat_idx" ON "coding_sessions" USING btree ("last_heartbeat_at") WHERE "coding_sessions"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_token_hash_uq" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_uq" ON "users" USING btree (lower("username"));