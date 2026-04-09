package com.minejava.productservice.service;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import com.minejava.productservice.dto.InventoryResponse;
import com.minejava.productservice.dto.ProductRequest;
import com.minejava.productservice.dto.ProductResponse;
import com.minejava.productservice.model.Product;
import com.minejava.productservice.repository.ProductRepository;

import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class ProductService {

    private final ProductRepository productRepository;
    private final WebClient.Builder webClientBuilder;

    public void createProduct(ProductRequest productRequest) {
        Product product = Product.builder()
                .name(productRequest.getName())
                .description(productRequest.getDescription())
                .price(productRequest.getPrice())
                .imageUrl(productRequest.getImageUrl())
                .build();

        productRepository.save(product);
        log.info("Product {} is saved", product.getId());

        try {
            int initialQuantity = productRequest.getQuantity() != null ? productRequest.getQuantity() : 0;
            webClientBuilder.build().post()
                    .uri("http://inventory-service:8080/api/inventory/init")
                    .bodyValue(Map.of("skuCode", product.getName(), "quantity", initialQuantity))
                    .retrieve()
                    .toBodilessEntity()
                    .block();
            log.info("Inventory initialized for {} with quantity {}", product.getName(), initialQuantity);
        } catch (Exception e) {
            log.error("Failed to initialize inventory: {}", e.getMessage());
        }
    }

    public void deleteProduct(String id) {
        productRepository.deleteById(id);
        log.info("Product {} is deleted", id);
    }

    public List<ProductResponse> getAllProducts() {
        List<Product> products = productRepository.findAll();
        if (products.isEmpty()) return List.of();

        // Nối các skuCode bằng dấu phẩy để gửi API chuẩn hơn
        String skuCodesParams = products.stream()
                .map(Product::getName)
                .collect(Collectors.joining(","));

        try {
            InventoryResponse[] inventoryResponses = webClientBuilder.build().get()
                    .uri("http://inventory-service:8080/api/inventory?skuCode=" + skuCodesParams)
                    .retrieve()
                    .bodyToMono(InventoryResponse[].class)
                    .block();

            Map<String, Integer> inventoryMap = Arrays.stream(inventoryResponses)
                    .collect(Collectors.toMap(
                        i -> i.getSkuCode().toLowerCase(), 
                        InventoryResponse::getQuantity,
                        (v1, v2) -> v1 // Nếu trùng thì lấy cái đầu
                    ));

            return products.stream().map(product -> 
                mapToProductResponse(product, inventoryMap.getOrDefault(product.getName().toLowerCase(), 0))
            ).toList();
        } catch (Exception e) {
            log.error("Failed to fetch inventory: {}", e.getMessage());
            return products.stream().map(product -> mapToProductResponse(product, 0)).toList();
        }
    }

    private ProductResponse mapToProductResponse(Product product, Integer quantity) {
        return ProductResponse.builder()
                .id(product.getId())
                .name(product.getName())
                .description(product.getDescription())
                .price(product.getPrice())
                .imageUrl(product.getImageUrl())
                .quantity(quantity)
                .build();
    }
}
