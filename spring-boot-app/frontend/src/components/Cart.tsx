import React, { useEffect, useState } from 'react';
import { cartService, orderService, paymentService, productService } from '../services/api';
import { Loader2, CreditCard, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';

const Cart: React.FC = () => {
    const { refreshCartCount } = useCart();
    const [cart, setCart] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const navigate = useNavigate();
    const userId = "user123";

    useEffect(() => {
        fetchCart();
    }, []);

    const fetchCart = async () => {
        try {
            const response = await cartService.getCart(userId);
            setCart(response.data);
        } catch (error) {
            console.error("Error fetching cart:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleClearCart = async () => {
        await cartService.clearCart(userId);
        refreshCartCount();
        fetchCart();
    };

    const handleCheckout = async () => {
        if (!cart || cart.items.length === 0) return;
        setProcessing(true);

        const orderRequest = {
            orderLineItemsDtoList: cart.items.map((item: any) => ({
                skuCode: item.name,
                price: item.price,
                quantity: item.quantity
            }))
        };

        try {
            const totalAmount = cart.items.reduce((acc: number, item: any) => acc + (item.price * item.quantity), 0);
            
            // Kiểm tra kho lần cuối trước khi tạo Order
            const productRes = await productService.getAllProducts();
            const productMap = new Map(productRes.data.map(p => [p.name, p.quantity || 0]));

            for (const item of cart.items) {
                const available = productMap.get(item.name) || 0;
                if (item.quantity > available) {
                    alert(`Sản phẩm "${item.name}" chỉ còn ${available} cái trong kho. Vui lòng cập nhật lại giỏ hàng.`);
                    setProcessing(false);
                    return;
                }
            }

            // 1. Create Order
            const orderResponse = await orderService.placeOrder(orderRequest);
            const orderId = orderResponse.data;

            if (orderId.includes("Something went wrong")) {
                alert("Lỗi: Không thể tạo đơn hàng. Có thể dịch vụ Kho (Inventory) đang gặp sự cố.");
                setProcessing(false);
                return;
            }

            // Chuyển sang trang chọn phương thức thanh toán (giỏ hàng vẫn giữ để an toàn)
            navigate('/checkout', { state: { orderId, totalAmount, items: orderRequest.orderLineItemsDtoList } });
        } catch (error) {
            console.error("Checkout error:", error);
            alert("Checkout failed. Check logs.");
            setProcessing(false);
        }
    };

    if (loading) return <div className="loader"><Loader2 className="spin" /> Loading Cart...</div>;

    const total = cart?.items.reduce((acc: number, item: any) => acc + (item.price * item.quantity), 0) || 0;

    return (
        <div className="cart-container">
            <h2 className="section-title">Giỏ Hàng Của Bạn</h2>
            {(!cart || cart.items.length === 0) ? (
                <div className="empty-cart">
                    <p>Giỏ hàng đang trống.</p>
                    <button className="btn-buy" onClick={() => navigate('/')}>Tiếp tục mua sắm</button>
                </div>
            ) : (
                <div className="cart-content">
                    <div className="cart-items">
                        {cart.items.map((item: any, index: number) => (
                            <div key={index} className="cart-item">
                                <div className="item-info">
                                    <h4>{item.name}</h4>
                                    <p className="item-price">${item.price.toFixed(2)} x {item.quantity}</p>
                                </div>
                                <div className="item-total">
                                    ${(item.price * item.quantity).toFixed(2)}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="cart-summary">
                        <div className="summary-row">
                            <span>Tổng cộng:</span>
                            <span className="total-price">${total.toFixed(2)}</span>
                        </div>
                        <button 
                            className="btn-checkout" 
                            onClick={handleCheckout}
                            disabled={processing}
                        >
                            {processing ? <Loader2 className="spin" size={20} /> : <CreditCard size={20} />}
                            Thanh Toán VNPay
                        </button>
                        <button className="btn-clear" onClick={handleClearCart}>
                            <Trash2 size={16} /> Xóa giỏ hàng
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Cart;
