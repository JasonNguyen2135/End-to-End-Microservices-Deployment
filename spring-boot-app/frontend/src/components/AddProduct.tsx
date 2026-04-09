import React, { useState, useEffect } from 'react';
import { productService } from '../services/api';
import { Product } from '../types';
import { Save, Loader2, ArrowLeft, Image as ImageIcon, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const AddProduct: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);
    const [product, setProduct] = useState<Product>({
        name: '',
        description: '',
        price: 0,
        imageUrl: '',
        quantity: 0
    });

    useEffect(() => {
        fetchProducts();
    }, []);

    const fetchProducts = async () => {
        try {
            const response = await productService.getAllProducts();
            setProducts(response.data);
        } catch (error) {
            console.error("Error fetching products:", error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await productService.createProduct(product);
            alert("Sản phẩm đã được tạo thành công!");
            setProduct({ name: '', description: '', price: 0, imageUrl: '', quantity: 0 });
            fetchProducts();
        } catch (error) {
            console.error("Error creating product:", error);
            alert("Lỗi khi tạo sản phẩm.");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("Bạn có chắc chắn muốn xóa sản phẩm này?")) return;
        try {
            await productService.deleteProduct(id);
            fetchProducts();
        } catch (error) {
            alert("Lỗi khi xóa sản phẩm.");
        }
    };

    return (
        <div className="admin-page">
            <div className="admin-card">
                <div className="admin-header">
                    <button className="btn-icon-text" onClick={() => navigate('/')}>
                        <ArrowLeft size={18} /> Quay lại cửa hàng
                    </button>
                    <h2>Quản Lý Cửa Hàng</h2>
                </div>
                
                <div className="admin-content">
                    <div className="form-section">
                        <h3>Thêm Sản Phẩm Mới</h3>
                        <form onSubmit={handleSubmit} className="admin-form">
                            <div className="form-grid">
                                <div className="form-group">
                                    <label>Tên Sản Phẩm</label>
                                    <input 
                                        type="text" 
                                        required 
                                        value={product.name}
                                        onChange={(e) => setProduct({...product, name: e.target.value})}
                                        placeholder="Ví dụ: iPhone 15 Pro"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Giá Bán ($)</label>
                                    <input 
                                        type="number" 
                                        required 
                                        min="0"
                                        step="0.01"
                                        value={product.price || ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setProduct({...product, price: val === '' ? 0 : parseFloat(val)});
                                        }}
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>

                            <div className="form-grid">
                                <div className="form-group">
                                    <label>Link Hình Ảnh</label>
                                    <input 
                                        type="text" 
                                        value={product.imageUrl}
                                        onChange={(e) => setProduct({...product, imageUrl: e.target.value})}
                                        placeholder="https://images.unsplash.com/..."
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Số Lượng Kho</label>
                                    <input 
                                        type="number" 
                                        required 
                                        min="0"
                                        value={product.quantity || ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setProduct({...product, quantity: val === '' ? 0 : parseInt(val)});
                                        }}
                                        placeholder="100"
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Mô tả</label>
                                <textarea 
                                    required 
                                    rows={3}
                                    value={product.description}
                                    onChange={(e) => setProduct({...product, description: e.target.value})}
                                    placeholder="Nhập mô tả sản phẩm..."
                                />
                            </div>

                            <button type="submit" className="btn-submit-admin" disabled={loading}>
                                {loading ? <Loader2 className="spin" size={20} /> : <Save size={20} />}
                                Lưu Sản Phẩm
                            </button>
                        </form>
                    </div>

                    <div className="list-section">
                        <h3>Danh Sách Sản Phẩm ({products.length})</h3>
                        <div className="admin-product-list">
                            {products.map((p) => (
                                <div key={p.id} className="admin-product-item">
                                    <img src={p.imageUrl || 'https://via.placeholder.com/50'} alt={p.name} />
                                    <div className="item-details">
                                        <p className="name">{p.name}</p>
                                        <p className="price">${p.price.toFixed(2)}</p>
                                    </div>
                                    <button className="btn-delete" onClick={() => handleDelete(p.id!)}>
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AddProduct;
