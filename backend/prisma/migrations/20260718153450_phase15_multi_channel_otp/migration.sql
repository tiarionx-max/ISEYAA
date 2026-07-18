-- CreateEnum
CREATE TYPE "OtpChannel" AS ENUM ('SMS', 'WHATSAPP', 'EMAIL');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "otpChannel" "OtpChannel" NOT NULL DEFAULT 'SMS';
