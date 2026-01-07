CREATE TABLE "conversation_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid,
	"user_id" text NOT NULL,
	"summary" text NOT NULL,
	"key_topics" jsonb,
	"entities" jsonb,
	"sentiment" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"metadata" jsonb,
	"importance" integer DEFAULT 5,
	"access_count" integer DEFAULT 0,
	"last_accessed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "summaries_user_idx" ON "conversation_summaries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "summaries_conversation_idx" ON "conversation_summaries" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "memories_user_idx" ON "user_memories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memories_type_idx" ON "user_memories" USING btree ("type");--> statement-breakpoint
CREATE INDEX "memories_key_idx" ON "user_memories" USING btree ("key");--> statement-breakpoint
CREATE INDEX "memories_user_key_idx" ON "user_memories" USING btree ("user_id","key");