CREATE TABLE "bot_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"game" text NOT NULL,
	"state" jsonb NOT NULL,
	"created_by" text,
	"status" text DEFAULT 'waiting' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"code" text PRIMARY KEY NOT NULL,
	"created_by" text NOT NULL,
	"max_uses" integer DEFAULT 1 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"user_id" text,
	"sender" text NOT NULL,
	"content" text NOT NULL,
	"at" jsonb,
	"batch_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recalled_at" timestamp with time zone,
	"recalled_by" text
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"permission" integer DEFAULT 0 NOT NULL,
	"banned_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "bot_sessions" ADD CONSTRAINT "bot_sessions_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_sessions" ADD CONSTRAINT "bot_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_recalled_by_users_id_fk" FOREIGN KEY ("recalled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bot_sessions_room_status_idx" ON "bot_sessions" USING btree ("room_id","status");--> statement-breakpoint
CREATE INDEX "invites_created_by_idx" ON "invites" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "messages_room_id_idx" ON "messages" USING btree ("room_id","id");--> statement-breakpoint
CREATE INDEX "messages_created_at_idx" ON "messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "rooms_closed_at_idx" ON "rooms" USING btree ("closed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_key" ON "users" USING btree ("username");