package com.minejava.orderservice.service;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import com.minejava.orderservice.dto.InventoryResponse;
import com.minejava.orderservice.dto.OrderItemDto;
import com.minejava.orderservice.dto.OrderLineItemsDto;
import com.minejava.orderservice.dto.OrderRequest;
import com.minejava.orderservice.event.OrderPlacedEvent;
import com.minejava.orderservice.event.PaymentEvent;
import com.minejava.orderservice.model.Order;
import com.minejava.orderservice.model.OrderLineItems;
import com.minejava.orderservice.repository.OrderRepository;
import io.micrometer.observation.Observation;
import io.micrometer.observation.ObservationRegistry;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.reactive.function.client.WebClient;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class OrderService {

    private final OrderRepository orderRepository;
    private final WebClient.Builder webClientBuilder;
    private final ObservationRegistry observationRegistry;
    private final ApplicationEventPublisher applicationEventPublisher;

    public String placeOrder(OrderRequest orderRequest) {
        Order order = new Order();
        order.setOrderNumber(UUID.randomUUID().toString());
        order.setStatus("PENDING");

        List<OrderLineItems> orderLineItems = orderRequest.getOrderLineItemsDtoList()
                    .stream()
                    .map(this::mapToDto)
                    .toList();
        order.setOrderLineItemsList(orderLineItems);

        List<String> skuCodes = order.getOrderLineItemsList().stream()
                                .map(OrderLineItems::getSkuCode)
                                .toList();

        Observation inventoryServiceObservation = Observation.createNotStarted("inventory-service-lookup",
                this.observationRegistry);

        return inventoryServiceObservation.observe(() -> {
            InventoryResponse[] inventoryResponseArray = webClientBuilder.build().get()
                    .uri("http://inventory-service:8080/api/inventory",
                    uriBuilder -> uriBuilder.queryParam("skuCode", skuCodes).build())
                    .retrieve()
                    .bodyToMono(InventoryResponse[].class)
                    .block();

            // Tạo bản đồ để tra cứu số lượng tồn kho nhanh hơn
            Map<String, Integer> inventoryMap = Arrays.stream(inventoryResponseArray)
                    .collect(Collectors.toMap(InventoryResponse::getSkuCode, InventoryResponse::getQuantity));

            // Kiểm tra từng món hàng trong đơn xem có đủ số lượng không
            boolean allProductsInStock = order.getOrderLineItemsList().stream().allMatch(item -> {
                Integer available = inventoryMap.getOrDefault(item.getSkuCode(), 0);
                return available >= item.getQuantity();
            });

            log.info("Stock verification for {}: {}", skuCodes, allProductsInStock);
            
            if (allProductsInStock && inventoryResponseArray.length > 0) {
                orderRepository.save(order);
                applicationEventPublisher.publishEvent(new OrderPlacedEvent(this, order.getOrderNumber()));
                return order.getOrderNumber(); // Return order number for payment
            } else {
                throw new IllegalArgumentException("Product currently not in stock");
            }
        });
    }

    @KafkaListener(topics = "payment-topic", groupId = "order-group")
    public void handlePaymentEvent(PaymentEvent paymentEvent) {
        log.info("Received payment event for order: {}", paymentEvent.getOrderId());
        orderRepository.findByOrderNumber(paymentEvent.getOrderId()).ifPresent(order -> {
            if ("SUCCESS".equals(paymentEvent.getStatus())) {
                order.setStatus("COMPLETED");
            } else {
                order.setStatus("FAILED");
            }
            orderRepository.save(order);
            log.info("Updated order {} status to {}", order.getOrderNumber(), order.getStatus());
        });
    }

    private OrderLineItems mapToDto(OrderLineItemsDto orderLineItemsDto){
        OrderLineItems orderLineItems = new OrderLineItems();
        orderLineItems.setPrice(orderLineItemsDto.getPrice());
        orderLineItems.setQuantity(orderLineItemsDto.getQuantity());
        orderLineItems.setSkuCode(orderLineItemsDto.getSkuCode());
        return orderLineItems;
    }
}
