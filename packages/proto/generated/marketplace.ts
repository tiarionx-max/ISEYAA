// Generated TypeScript interfaces for marketplace.proto

export interface GetProductRequest {
  productId: string;
}

export interface GetProductResponse {
  id: string;
  name: string;
  price: number;
  stock: number;
}

export interface ReserveStockRequest {
  productId: string;
  quantity: number;
  orderId: string;
}

export interface ReserveStockResponse {
  success: boolean;
  reservedQuantity: number;
}

export interface ConfirmOrderRequest {
  orderId: string;
  reference: string;
}

export interface ConfirmOrderResponse {
  success: boolean;
}

export interface MarketplaceServiceClient {
  getProduct(data: GetProductRequest): Promise<GetProductResponse>;
  reserveStock(data: ReserveStockRequest): Promise<ReserveStockResponse>;
  confirmOrder(data: ConfirmOrderRequest): Promise<ConfirmOrderResponse>;
}
