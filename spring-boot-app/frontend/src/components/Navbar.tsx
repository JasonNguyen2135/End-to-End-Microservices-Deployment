import React from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, User, Search } from 'lucide-react';
import { useCart } from '../context/CartContext';

const Navbar: React.FC = () => {
    const { cartCount } = useCart();

    return (
        <nav className="navbar">
            <div className="navbar-brand">
                <Link to="/">
                    <ShoppingBag className="logo-icon" size={28} />
                    <span className="logo-text">V-Shop</span>
                </Link>
            </div>
            
            <div className="search-bar">
                <Search size={18} className="search-icon" />
                <input type="text" placeholder="Tìm kiếm sản phẩm..." />
            </div>

            <ul className="navbar-links">
                <li>
                    <Link to="/" title="Cửa hàng">
                        Cửa hàng
                    </Link>
                </li>
                <li className="cart-link">
                    <Link to="/cart">
                        <div className="cart-icon-wrapper">
                            <ShoppingBag size={22} />
                            {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
                        </div>
                    </Link>
                </li>
                <li>
                    <Link to="/admin" className="admin-access" title="Quản trị">
                        <User size={20} />
                    </Link>
                </li>
            </ul>
        </nav>
    );
};

export default Navbar;
