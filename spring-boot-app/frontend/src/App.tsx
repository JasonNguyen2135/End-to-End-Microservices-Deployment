import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import ProductList from './components/ProductList';
import AddProduct from './components/AddProduct';
import Cart from './components/Cart';
import Checkout from './components/Checkout';
import PaymentResult from './components/PaymentResult';
import { CartProvider } from './context/CartContext';
import './index.css';

const App: React.FC = () => {
    return (
        <CartProvider>
            <Router>
                <div className="app">
                    <Navbar />
                    <main className="container">
                        <Routes>
                            <Route path="/" element={<ProductList />} />
                            <Route path="/admin" element={<AddProduct />} />
                            <Route path="/cart" element={<Cart />} />
                            <Route path="/checkout" element={<Checkout />} />
                            <Route path="/payment-result" element={<PaymentResult />} />
                        </Routes>
                    </main>
                </div>
            </Router>
        </CartProvider>
    );
};

export default App;
