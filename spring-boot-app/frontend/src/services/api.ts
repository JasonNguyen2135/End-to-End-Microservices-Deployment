import axios from 'axios';
import { Product, OrderRequest } from '../types';

const getApiBaseUrl = () => {
    const hostname = window.location.hostname;
    // If we are on localhost, we use the NodePort 30085
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:30085';
    }
    // If we are on AWS or other cluster, we use the current hostname with the NodePort
    return `http://${hostname}:30085`;
};

const API_BASE_URL = getApiBaseUrl();

const api = axios.create({
    baseURL: API_BASE_URL,
});

// Add a request interceptor to include the JWT token in the header
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export const productService = {
    getAllProducts: () => api.get<Product[]>('/api/product'),
    createProduct: (product: Product) => api.post('/api/product', product),
    deleteProduct: (id: string) => api.delete(`/api/product/${id}`),
};

export const orderService = {
    placeOrder: (order: OrderRequest) => api.post('/api/order', order),
};

export const cartService = {
    getCart: (userId: string) => api.get(`/api/cart/${userId}`),
    addToCart: (userId: string, item: any) => api.post(`/api/cart/${userId}/add`, item),
    clearCart: (userId: string) => api.delete(`/api/cart/${userId}`),
};

export const paymentService = {
    createPayment: (paymentRequest: { orderId: string, amount: number, orderInfo: string }) => 
        api.post('/api/payment/create', paymentRequest),
    manualConfirm: (orderId: string) => 
        api.post('/api/payment/manual-confirm', { orderId }),
};

export default api;
