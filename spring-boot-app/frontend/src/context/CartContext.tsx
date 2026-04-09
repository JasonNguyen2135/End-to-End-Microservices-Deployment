import React, { createContext, useContext, useState, useEffect } from 'react';
import { cartService, productService } from '../services/api';

interface CartContextType {
    cartCount: number;
    refreshCartCount: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [cartCount, setCartCount] = useState(0);
    const userId = "user123";

    const refreshCartCount = async () => {
        try {
            // 1. Lấy giỏ hàng hiện tại
            const cartRes = await cartService.getCart(userId);
            const cartItems = cartRes.data.items || [];

            // 2. Lấy danh sách sản phẩm thật từ server
            const productRes = await productService.getAllProducts();
            const validProductNames = productRes.data.map(p => p.name);

            // 3. Lọc ra những món còn tồn tại
            const validItems = cartItems.filter((item: any) => validProductNames.includes(item.name));

            if (validItems.length !== cartItems.length) {
                // Nếu có đồ bị xóa, ta nên cập nhật lại giỏ hàng (trong bản demo này ta chỉ hiện số lượng đúng)
                console.warn("Một số sản phẩm trong giỏ đã bị xóa khỏi cửa hàng.");
            }

            const count = validItems.reduce((acc: number, item: any) => acc + item.quantity, 0);
            setCartCount(count);
        } catch (error) {
            console.error("Failed to fetch cart count:", error);
        }
    };

    useEffect(() => {
        refreshCartCount();
    }, []);

    return (
        <CartContext.Provider value={{ cartCount, refreshCartCount }}>
            {children}
        </CartContext.Provider>
    );
};

export const useCart = () => {
    const context = useContext(CartContext);
    if (!context) throw new Error('useCart must be used within a CartProvider');
    return context;
};
