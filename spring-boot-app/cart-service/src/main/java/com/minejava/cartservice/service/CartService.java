package com.minejava.cartservice.service;

import com.minejava.cartservice.model.Cart;
import com.minejava.cartservice.model.CartItem;
import com.minejava.cartservice.repository.CartRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class CartService {
    private final CartRepository cartRepository;

    public Cart getCart(String userId) {
        return cartRepository.findById(userId).orElse(new Cart(userId, new ArrayList<>()));
    }

    public Cart addItem(String userId, CartItem item) {
        Cart cart = getCart(userId);
        Optional<CartItem> existingItem = cart.getItems().stream()
                .filter(i -> i.getProductId().equals(item.getProductId()))
                .findFirst();

        if (existingItem.isPresent()) {
            existingItem.get().setQuantity(existingItem.get().getQuantity() + item.getQuantity());
        } else {
            cart.getItems().add(item);
        }
        return cartRepository.save(cart);
    }

    public void clearCart(String userId) {
        cartRepository.deleteById(userId);
    }
}
