import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_features_currency" AS ENUM('USD', 'INR', 'EUR');
  CREATE TYPE "public"."enum_user_widget_subscriptions_billing_cycle" AS ENUM('monthly', 'yearly');
  CREATE TYPE "public"."enum_user_widget_subscriptions_currency" AS ENUM('USD', 'INR', 'EUR');
  CREATE TYPE "public"."enum_user_widget_subscriptions_status" AS ENUM('active', 'cancelled', 'expired');
  CREATE TABLE "user_widget_subscriptions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"feature_id" integer NOT NULL,
  	"billing_cycle" "enum_user_widget_subscriptions_billing_cycle" NOT NULL,
  	"price" numeric NOT NULL,
  	"currency" "enum_user_widget_subscriptions_currency" DEFAULT 'USD' NOT NULL,
  	"start_date" timestamp(3) with time zone NOT NULL,
  	"current_period_end" timestamp(3) with time zone NOT NULL,
  	"status" "enum_user_widget_subscriptions_status" DEFAULT 'active' NOT NULL,
  	"cancellation_date" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "features" ADD COLUMN "monthly_price" numeric;
  ALTER TABLE "features" ADD COLUMN "yearly_price" numeric;
  ALTER TABLE "features" ADD COLUMN "currency" "enum_features_currency" DEFAULT 'USD' NOT NULL;
  UPDATE "features" SET "monthly_price" = 3.99, "yearly_price" = 39.99 WHERE "code" = 'market-overview' AND "status" = 'active';
  UPDATE "features" SET "monthly_price" = 4.99, "yearly_price" = 49.99 WHERE "code" = 'watchlist' AND "status" = 'active';
  UPDATE "features" SET "monthly_price" = 7.99, "yearly_price" = 79.99 WHERE "code" = 'basic-charts' AND "status" = 'active';
  UPDATE "features" SET "monthly_price" = 3.99, "yearly_price" = 39.99 WHERE "code" = 'market-news' AND "status" = 'active';
  UPDATE "features" SET "monthly_price" = 8.99, "yearly_price" = 89.99 WHERE "code" = 'portfolio-analytics' AND "status" = 'active';
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "user_widget_subscriptions_id" integer;
  ALTER TABLE "user_widget_subscriptions" ADD CONSTRAINT "user_widget_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_widget_subscriptions" ADD CONSTRAINT "user_widget_subscriptions_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "user_widget_subscriptions_user_idx" ON "user_widget_subscriptions" USING btree ("user_id");
  CREATE INDEX "user_widget_subscriptions_feature_idx" ON "user_widget_subscriptions" USING btree ("feature_id");
  CREATE INDEX "user_widget_subscriptions_current_period_end_idx" ON "user_widget_subscriptions" USING btree ("current_period_end");
  CREATE INDEX "user_widget_subscriptions_updated_at_idx" ON "user_widget_subscriptions" USING btree ("updated_at");
  CREATE INDEX "user_widget_subscriptions_created_at_idx" ON "user_widget_subscriptions" USING btree ("created_at");
  CREATE UNIQUE INDEX "widget_subscription_active_user_feature_uidx" ON "user_widget_subscriptions" USING btree ("user_id", "feature_id") WHERE "status" = 'active';
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_user_widget_subscriptions_fk" FOREIGN KEY ("user_widget_subscriptions_id") REFERENCES "public"."user_widget_subscriptions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_user_widget_subscriptions__idx" ON "payload_locked_documents_rels" USING btree ("user_widget_subscriptions_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "user_widget_subscriptions" DISABLE ROW LEVEL SECURITY;
  DROP INDEX "widget_subscription_active_user_feature_uidx";
  DROP TABLE "user_widget_subscriptions" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_user_widget_subscriptions_fk";
  
  DROP INDEX "payload_locked_documents_rels_user_widget_subscriptions__idx";
  ALTER TABLE "features" DROP COLUMN "monthly_price";
  ALTER TABLE "features" DROP COLUMN "yearly_price";
  ALTER TABLE "features" DROP COLUMN "currency";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "user_widget_subscriptions_id";
  DROP TYPE "public"."enum_features_currency";
  DROP TYPE "public"."enum_user_widget_subscriptions_billing_cycle";
  DROP TYPE "public"."enum_user_widget_subscriptions_currency";
  DROP TYPE "public"."enum_user_widget_subscriptions_status";`)
}
