DROP TABLE IF EXISTS inventory;
CREATE TABLE inventory (
    id SERIAL PRIMARY KEY,
    sku_code VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL
);
