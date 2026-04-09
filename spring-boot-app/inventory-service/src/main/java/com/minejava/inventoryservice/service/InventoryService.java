package com.minejava.inventoryservice.service;

import java.util.List;
import java.util.Map;

import com.minejava.inventoryservice.dto.InventoryResponse;
import com.minejava.inventoryservice.dto.OrderItemDto;
import com.minejava.inventoryservice.event.PaymentEvent;
import com.minejava.inventoryservice.model.Inventory;
import com.minejava.inventoryservice.repository.InventoryRepository;

import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class InventoryService {

    private final InventoryRepository inventoryRepository;

    @Transactional(readOnly = true)
    public List<InventoryResponse> isInStock(List<String> skuCode) {
        List<String> lowerSkuCodes = skuCode.stream().map(String::toLowerCase).toList();
        
        return inventoryRepository.findAll().stream()
            .filter(inv -> lowerSkuCodes.contains(inv.getSkuCode().toLowerCase()))
            .map(inventory -> 
                InventoryResponse.builder()
                .skuCode(inventory.getSkuCode())
                .isInStock(inventory.getQuantity() > 0)
                .quantity(inventory.getQuantity())
                .build()
            ).toList();
    }

    @Transactional
    public void initInventory(String skuCode, Integer quantity) {
        List<Inventory> existing = inventoryRepository.findBySkuCodeIn(List.of(skuCode));
        if (!existing.isEmpty()) {
            Inventory inv = existing.get(0);
            inv.setQuantity(inv.getQuantity() + quantity);
            inventoryRepository.save(inv);
        } else {
            Inventory inventory = new Inventory();
            inventory.setSkuCode(skuCode);
            inventory.setQuantity(quantity);
            inventoryRepository.save(inventory);
        }
        log.info("Inventory updated for {}: added {}", skuCode, quantity);
    }

    @KafkaListener(topics = "payment-topic", groupId = "inventory-group")
    @Transactional
    public void handlePaymentEvent(PaymentEvent paymentEvent) {
        if ("SUCCESS".equals(paymentEvent.getStatus())) {
            log.info("Payment success for order {}. Decrementing stock.", paymentEvent.getOrderId());
            for (OrderItemDto item : paymentEvent.getItems()) {
                String skuCode = item.getSkuCode();
                Integer quantity = item.getQuantity();
                
                // Tìm chính xác SKU (không phân biệt hoa thường)
                List<Inventory> inventories = inventoryRepository.findAll();
                inventories.stream()
                    .filter(inv -> inv.getSkuCode().equalsIgnoreCase(skuCode))
                    .findFirst()
                    .ifPresent(inv -> {
                        inv.setQuantity(Math.max(0, inv.getQuantity() - quantity));
                        inventoryRepository.save(inv);
                        log.info("DECREMENT SUCCESS for {}: old={}, removed={}, new={}", 
                                skuCode, inv.getQuantity() + quantity, quantity, inv.getQuantity());
                    });
            }
        }
    }
}
