-- AddIndex: Ticket.userId
CREATE INDEX IF NOT EXISTS "tickets_userId_idx" ON "tickets"("userId");

-- AddIndex: Ticket.ticketTypeId
CREATE INDEX IF NOT EXISTS "tickets_ticketTypeId_idx" ON "tickets"("ticketTypeId");

-- AddIndex: Booking.userId
CREATE INDEX IF NOT EXISTS "bookings_userId_idx" ON "bookings"("userId");

-- AddIndex: Order.userId
CREATE INDEX IF NOT EXISTS "orders_userId_idx" ON "orders"("userId");

-- AddIndex: Order.vendorId
CREATE INDEX IF NOT EXISTS "orders_vendorId_idx" ON "orders"("vendorId");

-- AddIndex: OrderItem.orderId
CREATE INDEX IF NOT EXISTS "order_items_orderId_idx" ON "order_items"("orderId");

-- AddIndex: OrderItem.productId
CREATE INDEX IF NOT EXISTS "order_items_productId_idx" ON "order_items"("productId");

-- AddIndex: Transaction.walletId
CREATE INDEX IF NOT EXISTS "transactions_walletId_idx" ON "transactions"("walletId");

-- AddIndex: AuditLog.userId
CREATE INDEX IF NOT EXISTS "audit_logs_userId_idx" ON "audit_logs"("userId");

-- AddIndex: AuditLog.createdAt
CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddIndex: Trip.riderId
CREATE INDEX IF NOT EXISTS "trips_riderId_idx" ON "trips"("riderId");
