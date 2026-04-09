CREATE TABLE IF NOT EXISTS t_orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(255),
    status VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS t_orders_order_line_items_list (
    order_id BIGINT NOT NULL,
    order_line_items_list_id BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS t_order_line_items (
    id SERIAL PRIMARY KEY,
    sku_code VARCHAR(255),
    price DECIMAL,
    quantity INTEGER
);
