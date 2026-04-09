# 🚀 End-to-End Microservices Deployment

Dự án này thực hiện tự động hóa hoàn toàn quy trình xây dựng hạ tầng Cloud, khởi tạo cụm Kubernetes và triển khai hệ thống Microservices thương mại điện tử chuyên nghiệp.

## 🛠 Công nghệ cốt lõi

* **Cloud Provider:** AWS (Amazon Web Services).
* **IaC:** Terraform (Quản lý EC2, VPC, Security Groups).
* **Configuration Management:** Ansible & Kubespray.
* **Orchestration:** Kubernetes v1.30+.
* **Backend:** Spring Boot 3, Spring Cloud, Kafka, MongoDB, PostgreSQL.
* **Frontend:** React (TypeScript), VietQR/VNPay Integration.
* **Security:** Keycloak (OAuth2/OIDC).

---

## 🏗 Giai đoạn 1: Hạ tầng & Kubernetes

Hạ tầng được triển khai trên AWS EC2 bằng Terraform và Kubespray.

### 1. Khởi tạo hạ tầng với Terraform
```bash
cd terraform
terraform init
terraform apply -auto-approve
```

### 2. Triển khai cụm Kubernetes với Ansible
```bash
cd kubespray
ansible-playbook -i ../inventory/mycluster/hosts.yaml ... cluster.yml
```

---

## 📦 Giai đoạn 2: Triển khai Microservices (Spring Kafka App)

Toàn bộ mã nguồn ứng dụng nằm trong thư mục `spring-boot-app`.

### 1. Build và Push Image lên Docker Hub
Hệ thống sử dụng Jib để đóng gói Image Java và Docker cho Frontend. Bạn cần đăng nhập Docker trước khi chạy script.

```bash
cd spring-boot-app
# Đảm bảo file script có quyền thực thi và đúng định dạng Linux
sed -i 's/\r$//' build-and-push.sh
chmod +x build-and-push.sh

./build-and-push.sh
```

### 2. Triển khai lên cụm Kubernetes
Chạy các lệnh apply theo thứ tự để đảm bảo hạ tầng sẵn sàng trước khi các app khởi chạy.

```bash
cd spring-boot-app/k8s

# Tạo Namespace
kubectl apply -f namespace.yaml

# Triển khai Databases & Messaging (Mongo, Postgres, Kafka, MySQL)
kubectl apply -f databases.yaml
kubectl apply -f kafka-zipkin.yaml

# Triển khai Bảo mật (Keycloak)
kubectl apply -f keycloak.yaml

# Triển khai Microservices & Frontend
kubectl apply -f ecommerce-expansion.yaml
kubectl apply -f services.yaml
kubectl apply -f frontend.yaml
```

### 3. Các tính năng chính của ứng dụng
* **Storefront:** Giao diện mua sắm hiện đại, hiển thị tồn kho thời gian thực.
* **Cart Service:** Quản lý giỏ hàng đồng bộ với danh mục sản phẩm.
* **VNPay & VietQR:** Tích hợp thanh toán qua cổng VNPay Sandbox và tạo mã VietQR chuyển khoản nhanh.
* **Inventory Control:** Chặn đặt hàng nếu vượt quá số lượng tồn kho, tự động trừ kho sau khi thanh toán thành công qua Kafka.

---

## 🎯 Kết quả đạt được
- [x] Hạ tầng AWS tự động hóa hoàn toàn.
- [x] Cụm Kubernetes Production Ready.
- [x] Hệ thống Microservices giao tiếp thông suốt qua Kafka và Service Discovery.
- [x] Luồng thanh toán thương mại điện tử hoàn chỉnh với kiểm soát kho nghiêm ngặt.
