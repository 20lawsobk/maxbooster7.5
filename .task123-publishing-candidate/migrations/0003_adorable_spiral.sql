CREATE TABLE "customer_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"tier_id" uuid NOT NULL,
	"storefront_id" uuid NOT NULL,
	"stripe_subscription_id" varchar(255),
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"starts_at" timestamp DEFAULT now() NOT NULL,
	"ends_at" timestamp,
	"canceled_at" timestamp,
	"cancel_at_period_end" boolean DEFAULT false,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instant_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" varchar(10) DEFAULT 'usd' NOT NULL,
	"stripe_payout_id" varchar(255),
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"failure_reason" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "membership_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storefront_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"price_cents" integer NOT NULL,
	"currency" varchar(10) DEFAULT 'usd',
	"interval" varchar(20) DEFAULT 'month' NOT NULL,
	"benefits" jsonb DEFAULT '{}'::jsonb,
	"stripe_price_id" varchar(255),
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"max_subscribers" integer,
	"current_subscribers" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storefront_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"preview_url" text,
	"thumbnail_url" text,
	"customization_options" jsonb DEFAULT '{}'::jsonb,
	"is_premium" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storefronts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"template_id" uuid,
	"customization" jsonb DEFAULT '{}'::jsonb,
	"seo" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true,
	"is_public" boolean DEFAULT true,
	"views" integer DEFAULT 0,
	"unique_visitors" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "storefronts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "available_balance" numeric(10, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "customer_memberships" ADD CONSTRAINT "customer_memberships_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_memberships" ADD CONSTRAINT "customer_memberships_tier_id_membership_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."membership_tiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_memberships" ADD CONSTRAINT "customer_memberships_storefront_id_storefronts_id_fk" FOREIGN KEY ("storefront_id") REFERENCES "public"."storefronts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instant_payouts" ADD CONSTRAINT "instant_payouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_tiers" ADD CONSTRAINT "membership_tiers_storefront_id_storefronts_id_fk" FOREIGN KEY ("storefront_id") REFERENCES "public"."storefronts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storefronts" ADD CONSTRAINT "storefronts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storefronts" ADD CONSTRAINT "storefronts_template_id_storefront_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."storefront_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_memberships_customer_id_idx" ON "customer_memberships" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_memberships_tier_id_idx" ON "customer_memberships" USING btree ("tier_id");--> statement-breakpoint
CREATE INDEX "customer_memberships_storefront_id_idx" ON "customer_memberships" USING btree ("storefront_id");--> statement-breakpoint
CREATE INDEX "customer_memberships_status_idx" ON "customer_memberships" USING btree ("status");--> statement-breakpoint
CREATE INDEX "customer_memberships_customer_status_idx" ON "customer_memberships" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "customer_memberships_storefront_status_idx" ON "customer_memberships" USING btree ("storefront_id","status");--> statement-breakpoint
CREATE INDEX "instant_payouts_user_id_idx" ON "instant_payouts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "instant_payouts_status_idx" ON "instant_payouts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "instant_payouts_requested_at_idx" ON "instant_payouts" USING btree ("requested_at");--> statement-breakpoint
CREATE INDEX "instant_payouts_user_status_idx" ON "instant_payouts" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "membership_tiers_storefront_id_idx" ON "membership_tiers" USING btree ("storefront_id");--> statement-breakpoint
CREATE INDEX "membership_tiers_is_active_idx" ON "membership_tiers" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "membership_tiers_sort_order_idx" ON "membership_tiers" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "membership_tiers_storefront_active_idx" ON "membership_tiers" USING btree ("storefront_id","is_active");--> statement-breakpoint
CREATE INDEX "storefront_templates_is_active_idx" ON "storefront_templates" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "storefront_templates_sort_order_idx" ON "storefront_templates" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "storefronts_user_id_idx" ON "storefronts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "storefronts_slug_idx" ON "storefronts" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "storefronts_is_active_idx" ON "storefronts" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "storefronts_is_public_idx" ON "storefronts" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "storefronts_template_id_idx" ON "storefronts" USING btree ("template_id");