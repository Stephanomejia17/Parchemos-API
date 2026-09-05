-- DropForeignKey
ALTER TABLE "location_images" DROP CONSTRAINT "location_images_location_id_fkey";

-- DropForeignKey
ALTER TABLE "location_schedules" DROP CONSTRAINT "location_schedules_location_id_fkey";

-- DropForeignKey
ALTER TABLE "locations" DROP CONSTRAINT "locations_restaurant_id_fkey";

-- DropForeignKey
ALTER TABLE "login_attempts" DROP CONSTRAINT "login_attempts_user_id_fkey";

-- DropForeignKey
ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "password_reset_tokens_user_id_fkey";

-- DropForeignKey
ALTER TABLE "products" DROP CONSTRAINT "products_restaurant_id_fkey";

-- DropForeignKey
ALTER TABLE "restaurants" DROP CONSTRAINT "restaurants_owner_id_fkey";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_sede_id_fkey";

-- DropIndex
DROP INDEX "users_sede_id_idx";

-- AlterTable
ALTER TABLE "locations" ALTER COLUMN "name" SET DATA TYPE TEXT,
ALTER COLUMN "description" SET DATA TYPE TEXT,
ALTER COLUMN "address" SET DATA TYPE TEXT,
ALTER COLUMN "rejection_reason" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "restaurants" ALTER COLUMN "business_name" SET DATA TYPE TEXT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_schedules" ADD CONSTRAINT "location_schedules_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_images" ADD CONSTRAINT "location_images_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "location_schedules_location_day_idx" RENAME TO "location_schedules_location_id_day_of_week_idx";

-- RenameIndex
ALTER INDEX "login_attempts_email_created_idx" RENAME TO "login_attempts_email_attempted_created_at_idx";

-- RenameIndex
ALTER INDEX "login_attempts_ip_created_idx" RENAME TO "login_attempts_ip_address_created_at_idx";

-- RenameIndex
ALTER INDEX "login_attempts_user_created_idx" RENAME TO "login_attempts_user_id_created_at_idx";

-- RenameIndex
ALTER INDEX "password_reset_tokens_expiry_idx" RENAME TO "password_reset_tokens_expires_at_idx";

-- RenameIndex
ALTER INDEX "password_reset_tokens_user_expiry_idx" RENAME TO "password_reset_tokens_user_id_expires_at_idx";

-- RenameIndex
ALTER INDEX "products_restaurant_category_idx" RENAME TO "products_restaurant_id_category_idx";

-- RenameIndex
ALTER INDEX "products_restaurant_featured_idx" RENAME TO "products_restaurant_id_featured_idx";

-- RenameIndex
ALTER INDEX "products_restaurant_status_idx" RENAME TO "products_restaurant_id_status_idx";
