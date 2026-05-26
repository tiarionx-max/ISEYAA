-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('BIKE', 'TRICYCLE', 'CAR', 'MINIBUS');

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('SEARCHING', 'MATCHED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DeliveryOrderStatus" AS ENUM ('SEARCHING', 'MATCHED', 'COLLECTING', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "drivers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "licenceNumber" TEXT NOT NULL,
    "licenceExpiry" TIMESTAMP(3) NOT NULL,
    "status" "DriverStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "avgRating" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalTrips" INTEGER NOT NULL DEFAULT 0,
    "acceptanceRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "colour" TEXT NOT NULL,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "driverId" TEXT,
    "vehicleId" TEXT,
    "vehicleType" "VehicleType" NOT NULL,
    "pickupLat" DECIMAL(65,30) NOT NULL,
    "pickupLng" DECIMAL(65,30) NOT NULL,
    "pickupAddress" TEXT,
    "dropoffLat" DECIMAL(65,30) NOT NULL,
    "dropoffLng" DECIMAL(65,30) NOT NULL,
    "dropoffAddress" TEXT,
    "distanceKm" DECIMAL(65,30),
    "fare" DECIMAL(65,30),
    "surgeMultiplier" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "platformFee" DECIMAL(65,30),
    "driverEarnings" DECIMAL(65,30),
    "status" "TripStatus" NOT NULL DEFAULT 'SEARCHING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchedAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "riderRating" INTEGER,
    "driverRating" INTEGER,
    "cancelReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_events" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_riders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "DriverStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "avgRating" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalDeliveries" INTEGER NOT NULL DEFAULT 0,
    "acceptanceRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "delivery_riders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_orders" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "riderId" TEXT,
    "pickupAddress" TEXT NOT NULL,
    "pickupLat" DECIMAL(65,30) NOT NULL,
    "pickupLng" DECIMAL(65,30) NOT NULL,
    "dropoffAddress" TEXT NOT NULL,
    "dropoffLat" DECIMAL(65,30) NOT NULL,
    "dropoffLng" DECIMAL(65,30) NOT NULL,
    "itemDescription" TEXT NOT NULL,
    "weightKg" DECIMAL(65,30) NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "fee" DECIMAL(65,30),
    "platformFee" DECIMAL(65,30),
    "riderEarnings" DECIMAL(65,30),
    "status" "DeliveryOrderStatus" NOT NULL DEFAULT 'SEARCHING',
    "proofPhotoUrl" TEXT,
    "otpVerifiedAt" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchedAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "senderRating" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "delivery_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_events" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "drivers_userId_key" ON "drivers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plateNumber_key" ON "vehicles"("plateNumber");

-- CreateIndex
CREATE INDEX "trips_status_requestedAt_idx" ON "trips"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "trips_driverId_status_idx" ON "trips"("driverId", "status");

-- CreateIndex
CREATE INDEX "trips_riderId_idx" ON "trips"("riderId");

-- CreateIndex
CREATE INDEX "delivery_orders_status_createdAt_idx" ON "delivery_orders"("status", "createdAt");

-- CreateIndex
CREATE INDEX "delivery_orders_riderId_status_idx" ON "delivery_orders"("riderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_riders_userId_key" ON "delivery_riders"("userId");

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_riders" ADD CONSTRAINT "delivery_riders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "delivery_riders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "delivery_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
