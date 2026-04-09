export interface Product {
    id?: string;
    name: string;
    description: string;
    price: number;
    imageUrl?: string;
    quantity?: number;
}

export interface OrderLineItemsDto {
    id?: number;
    skuCode: string;
    price: number;
    quantity: number;
}

export interface OrderRequest {
    orderLineItemsDtoList: OrderLineItemsDto[];
}
