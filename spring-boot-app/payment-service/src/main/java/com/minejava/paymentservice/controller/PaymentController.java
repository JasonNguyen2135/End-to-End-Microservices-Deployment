package com.minejava.paymentservice.controller;

import com.minejava.paymentservice.dto.OrderItemDto;
import com.minejava.paymentservice.dto.PaymentRequest;
import com.minejava.paymentservice.event.PaymentEvent;
import com.minejava.paymentservice.service.PaymentService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.web.bind.annotation.*;

import java.io.UnsupportedEncodingException;
import java.util.ArrayList;
import java.util.Map;

@RestController
@RequestMapping("/api/payment")
@RequiredArgsConstructor
public class PaymentController {

    private final PaymentService paymentService;
    private final KafkaTemplate<String, PaymentEvent> kafkaTemplate;

    @PostMapping("/create")
    public String createPayment(@RequestBody PaymentRequest paymentRequest, HttpServletRequest request) throws UnsupportedEncodingException {
        return paymentService.createPayment(paymentRequest, request);
    }

    @GetMapping("/vnpay-callback")
    public String vnpayCallback(@RequestParam Map<String, String> queryParams) {
        String vnp_ResponseCode = queryParams.get("vnp_ResponseCode");
        String orderId = queryParams.get("vnp_TxnRef");

        if ("00".equals(vnp_ResponseCode)) {
            kafkaTemplate.send("payment-topic", new PaymentEvent(orderId, "SUCCESS", new ArrayList<>()));
            return "Payment Success. You can close this window.";
        } else {
            kafkaTemplate.send("payment-topic", new PaymentEvent(orderId, "FAILED", new ArrayList<>()));
            return "Payment Failed.";
        }
    }

    @PostMapping("/manual-confirm")
    public String manualConfirm(@RequestBody PaymentRequest paymentRequest) {
        kafkaTemplate.send("payment-topic", new PaymentEvent(paymentRequest.getOrderId(), "SUCCESS", paymentRequest.getItems()));
        return "SUCCESS";
    }
}
