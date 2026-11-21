ALTER TYPE "public"."otp_purpose" ADD VALUE 'recovery';--> statement-breakpoint
ALTER TABLE "invitations" ALTER COLUMN "invited_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "role" "app_role" DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "needs_rotation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "activated_at" timestamp with time zone;