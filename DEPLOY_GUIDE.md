# Hướng dẫn Deploy trên môi trường Local

Tài liệu này hướng dẫn triển khai hệ thống microservices e-commerce trên **máy local** (Linux/WSL2), dựa trên source code hiện tại của repo (đã merge `main` mới nhất, commit `fe44af8 chore: add secrets and production readiness manifests`).

> Repo cung cấp **3 con đường deploy**, từ đơn giản đến đầy đủ:
> - **Phần A — Docker Compose:** chạy nhanh để dev/demo. 1 lệnh xong.
> - **Phần B — Kubernetes local (k3d):** triển khai bằng Kustomize + Secret, đúng giống production.
> - **Phần C — CI/CD đầy đủ (GitHub Actions + ArgoCD):** mô phỏng GitOps end-to-end.
>
> Đọc kèm `CICD_GUIDE.md` để hiểu kiến trúc pipeline.

---

## 0. Yêu cầu hệ thống

### 0.1. Tài nguyên

| Mục   | Tối thiểu      | Khuyến nghị                                    |
|-------|----------------|------------------------------------------------|
| RAM   | 12 GB           | 16 GB (10 service + DB + Kafka khá nặng)      |
| Disk  | 20 GB           | 30 GB                                         |
| OS    | Linux/WSL2      | Ubuntu 22.04+ trên WSL2                       |

### 0.2. Tools

```bash
# Bắt buộc cho mọi phần
docker --version           # ≥ 24
docker compose version
git --version

# Cho Phần B & C
kubectl version --client   # ≥ 1.28
k3d version                # ≥ 5.6
```

Cài thiếu (Ubuntu/WSL2):
```bash
# k3d
curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash

# kubectl
sudo snap install kubectl --classic   # hoặc apt

# (tuỳ chọn) gh + argocd CLI
sudo apt install -y gh
curl -sSL -o /tmp/argocd \
  https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
sudo install -m 555 /tmp/argocd /usr/local/bin/argocd
```

> 💡 **Không cần JDK 17 trên host** — Dockerfile của các service đã dùng image `maven:3.9.9-eclipse-temurin-17` để build trong container (multi-stage build).

### 0.3. Accounts

| Dịch vụ    | Cần gì                                                | Dùng ở đâu       |
|------------|-------------------------------------------------------|------------------|
| Docker Hub | Username + Access Token (Read/Write)                  | Mọi phần         |
| GitHub     | Repo của bạn (fork repo này) + Personal Access Token  | Phần C           |

Login Docker Hub:
```bash
docker login -u <docker-username>
```

---

# Phần A — Deploy nhanh bằng Docker Compose

Phù hợp cho dev/demo. Mọi thứ chạy như Docker container trên máy.

## A.1. Build images

File `spring-boot-app/build-and-push.sh` mới hỗ trợ env var:

```bash
cd spring-boot-app
chmod +x build-and-push.sh

# Đăng nhập Docker Hub trước
docker login -u <docker-username>

# Build và push (mặc định tag = main)
DOCKER_USERNAME=<docker-username> ./build-and-push.sh

# Hoặc tag dev
DOCKER_USERNAME=<docker-username> IMAGE_TAG=dev ./build-and-push.sh
```

Script sẽ:
- Build 9 service Java bằng `docker build -f <service>/Dockerfile` (multi-stage, dùng Maven Temurin 17 trong container).
- Build `frontend` bằng `docker build` từ thư mục `frontend/`.
- Push tất cả lên `<DOCKER_USERNAME>/<service>:<IMAGE_TAG>`.

> Nếu không muốn push, có thể comment dòng `docker push` trong `build-and-push.sh`, hoặc dùng `docker compose build` ở bước A.2 (compose file đã có `build:` block sẵn).

## A.2. Khởi chạy stack

```bash
cd spring-boot-app

# Tạo .env (compose tự đọc)
cat > .env <<EOF
DOCKER_USERNAME=<docker-username>
IMAGE_TAG=main
EOF

# Khởi chạy
docker compose up -d

# Theo dõi
docker compose ps
docker compose logs -f api-gateway
```

> Nếu chưa có image trên Docker Hub, có thể build local trực tiếp qua compose:
> ```bash
> docker compose build
> docker compose up -d
> ```

## A.3. Truy cập ứng dụng

| Service              | URL / Port                |
|----------------------|---------------------------|
| Frontend             | http://localhost:3000     |
| API Gateway          | http://localhost:8085     |
| Discovery (Eureka)   | http://localhost:8761     |
| Admin Server         | http://localhost:8081     |
| Product Service      | http://localhost:8084     |
| Cart Service         | http://localhost:8083     |
| Inventory Service    | http://localhost:8082     |
| Order Service        | http://localhost:8086     |
| Payment Service      | http://localhost:8087     |
| Keycloak             | http://localhost:8181     |
| Zipkin (tracing)     | http://localhost:9411     |
| Kafka broker         | localhost:9092            |
| MongoDB              | localhost:27017           |
| Postgres (Keycloak)  | localhost:5432            |
| Postgres (Order)     | localhost:5433            |
| Postgres (Inventory) | localhost:5434            |

## A.4. Dừng / Reset

```bash
docker compose down            # dừng, giữ data
docker compose down -v         # dừng và xoá volume (mất data)
```

---

# Phần B — Deploy lên Kubernetes Local (k3d + Kustomize)

Đúng giống production, nhưng cluster chạy local trên Docker. **Không cần ArgoCD** ở phần này.

## B.1. Tạo cluster k3d

Manifest `spring-boot-app/k8s/` dùng NodePort `30000` (frontend) và `30085` (api-gateway). Cluster phải expose 2 port này:

```bash
k3d cluster create vshop \
  --servers 1 --agents 2 \
  --port "30000:30000@server:0" \
  --port "30085:30085@server:0" \
  --port "8080:80@loadbalancer"

kubectl cluster-info
kubectl get nodes
```

> RAM hạn chế: dùng `--agents 0` để chạy single-node.

## B.2. Cài Argo Rollouts CRD

Manifest có `kind: Rollout` (canary deployment), cần CRD này:

```bash
kubectl create namespace argo-rollouts
kubectl apply -n argo-rollouts \
  -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml
```

## B.3. Đổi Docker namespace cho khớp tài khoản của bạn

Mặc định manifest dùng `kaingyn615/<service>`. Đổi sang username Docker Hub của bạn:

```bash
grep -rln "kaingyn615" spring-boot-app/k8s spring-boot-app/k8s-staging argocd \
  | xargs sed -i "s|kaingyn615|hiunehihi|g"
```

## B.4. Tạo Secret từ file mẫu

`k8s/secrets.yaml` đã được `.gitignore` để tránh leak credential. Copy từ file mẫu rồi điền giá trị thật:

```bash
cp spring-boot-app/k8s/secret-example.yaml spring-boot-app/k8s/secrets.yaml
```

Mở `spring-boot-app/k8s/secrets.yaml` và sửa toàn bộ `change-me`:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
  namespace: spring-microservices
type: Opaque
stringData:
  postgres-order-password: <password mạnh>
  postgres-inventory-password: <password mạnh>
  keycloak-mysql-root-password: <password mạnh>
  keycloak-mysql-password: <password mạnh>
  keycloak-db-password: <password mạnh>
  keycloak-admin-password: <password admin Keycloak>
  vnpay-tmn-code: <VNPay TMN code, hoặc "TEST" cho dev>
  vnpay-hash-secret: <VNPay hash secret, hoặc "TEST" cho dev>
  eureka-default-zone: http://eureka:<password>@discovery-server:8761/eureka/
```

> Để dev nhanh, có thể thay tất cả bằng `dev-password-123` và VNPay = `TEST`.

## B.5. Apply manifest

```bash
# Tạo namespace và Secret trước
kubectl apply -f spring-boot-app/k8s/namespace.yaml
kubectl apply -f spring-boot-app/k8s/secrets.yaml

# Apply toàn bộ qua Kustomize
kubectl apply -k spring-boot-app/k8s

# Theo dõi
kubectl get pods -n spring-microservices -w
```

Đợi 5–10 phút cho tất cả pod chuyển `Running`/`Ready` (DB, Kafka, Keycloak khởi động chậm).

## B.6. Truy cập ứng dụng

| Service       | URL                       |
|---------------|---------------------------|
| Frontend      | http://localhost:30000    |
| API Gateway   | http://localhost:30085    |

Các service khác có thể truy cập qua port-forward:
```bash
kubectl port-forward -n spring-microservices svc/discovery-server 8761:8761
kubectl port-forward -n spring-microservices svc/keycloak 8181:8080
```

## B.7. Update image (nếu build lại)

```bash
# Build & push image mới
cd spring-boot-app
DOCKER_USERNAME=hiunehihi IMAGE_TAG=main ./build-and-push.sh

# Force pod restart để pull image mới
kubectl rollout restart deployment -n spring-microservices
# (hoặc cho rollout)
kubectl rollout restart rollout -n spring-microservices
```

## B.8. Xoá cluster

```bash
kubectl delete -k spring-boot-app/k8s
kubectl delete -f spring-boot-app/k8s/secrets.yaml
k3d cluster delete vshop
```

---

# Phần C — CI/CD đầy đủ (GitHub Actions + ArgoCD)

Mô phỏng luồng GitOps thực tế. Cần đã làm xong **Phần B** (cluster k3d + Argo Rollouts).

## C.1. Push repo lên GitHub của bạn

```bash
# Đổi remote nếu chưa
git remote set-url origin https://github.com/<your-gh-username>/End-to-End-Microservices-Deployment.git

# Push branch
git push -u origin feature/web-ecommerce
git push origin main          # nếu chưa có
```

## C.2. Cấu hình GitHub Secrets

Vào **Settings → Secrets and variables → Actions** trên repo của bạn:

| Secret              | Bắt buộc | Giá trị                  |
|---------------------|----------|--------------------------|
| `DOCKER_USERNAME`   | ✅       | username Docker Hub      |
| `DOCKER_PASSWORD`   | ✅       | Docker Hub Access Token  |
| `SONAR_TOKEN`       | ❌       | (bỏ qua được)            |
| `SONAR_HOST_URL`    | ❌       | (bỏ qua được)            |
| `SLACK_WEBHOOK_URL` | ❌       | (bỏ qua được)            |

> Workflow đã guard `if: env.X != ''`, secret tuỳ chọn không có cũng không fail.

## C.3. Cài ArgoCD lên cluster

```bash
kubectl create namespace argocd
kubectl apply -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

kubectl rollout status -n argocd deploy/argocd-server --timeout=300s

# Lấy mật khẩu admin
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d ; echo

# Mở UI (terminal khác)
kubectl port-forward -n argocd svc/argocd-server 8090:443
# https://localhost:8090 — user: admin
```

## C.4. (Tuỳ chọn) Cài ArgoCD Image Updater

Image Updater **cần Git write credentials** để commit ngược digest về repo. Trên local có thể bỏ qua, dùng "đường thay thế" ở C.7.

```bash
kubectl apply -n argocd \
  -f https://raw.githubusercontent.com/argoproj-labs/argocd-image-updater/stable/manifests/install.yaml

# Cấp PAT GitHub
kubectl -n argocd create secret generic git-creds \
  --from-literal=username=<your-gh-username> \
  --from-literal=password=<your-gh-pat>

kubectl apply -f argocd/image-updater.yaml
```

## C.5. Sửa repoURL trong ArgoCD Applications

```bash
sed -i "s|davidmoi2135/End-to-End-Microservices-Deployment|<your-gh-username>/End-to-End-Microservices-Deployment|g" \
  argocd/staging-app.yaml argocd/production-app.yaml
```

## C.6. Apply ArgoCD Applications

```bash
# Đảm bảo Secret đã có trong cả 2 namespace mà ArgoCD sẽ tạo
kubectl apply -f argocd/staging-app.yaml
kubectl apply -f argocd/production-app.yaml

kubectl get applications -n argocd
```

> **Quan trọng:** Manifests dùng `app-secrets`. Sau khi ArgoCD tạo namespace, phải apply Secret thủ công vào từng namespace (Secret không nằm trong Kustomize):
> ```bash
> # Cho staging
> kubectl create namespace spring-microservices-staging --dry-run=client -o yaml | kubectl apply -f -
> sed 's/namespace: spring-microservices/namespace: spring-microservices-staging/' \
>   spring-boot-app/k8s/secrets.yaml | kubectl apply -f -
>
> # Cho production
> kubectl create namespace spring-microservices --dry-run=client -o yaml | kubectl apply -f -
> kubectl apply -f spring-boot-app/k8s/secrets.yaml
> ```

## C.7. Trigger CI

```bash
git checkout dev || git checkout -b dev
git commit --allow-empty -m "ci: trigger first build"
git push origin dev

# Theo dõi
gh run list --branch dev --limit 5
gh run watch
```

CI sẽ build → push image lên Docker Hub:
- `<docker-user>/<service>:dev`
- `<docker-user>/<service>:dev-<sha>` (immutable)

**Nếu KHÔNG cài Image Updater:** mỗi lần CI xong, sửa tay tag trong `kustomization.yaml`:
```bash
NEW_SHA=$(git rev-parse --short=7 HEAD)
sed -i "s|newTag:.*|newTag: dev-${NEW_SHA}|" \
  spring-boot-app/k8s-staging/kustomization.yaml
git add -A && git commit -m "chore: bump staging to dev-${NEW_SHA}"
git push origin dev
```
ArgoCD sẽ tự sync (vì `automated.selfHeal: true`).

## C.8. Truy cập

| Môi trường  | Frontend                | API Gateway              |
|-------------|-------------------------|--------------------------|
| Staging     | http://localhost:31000  | http://localhost:31085   |
| Production  | http://localhost:30000  | http://localhost:30085   |

> Cluster k3d phải được tạo với cả 4 port: thêm `--port "31000:31000@server:0" --port "31085:31085@server:0"` vào `k3d cluster create` (xem B.1).

## C.9. Promote Staging → Production

```bash
gh pr create --base main --head dev --title "release: dev → main"
# review → merge → CI build tag 'main' → ArgoCD sync vào namespace spring-microservices
```

## C.10. Audit toàn bộ luồng

```bash
./scripts/check-cicd-argocd-flow.sh --env staging --apply-app --watch-pods
./scripts/check-cicd-argocd-flow.sh --env production --apply-app --sync-app
```

---

# Phần D — Default Credentials

> ⚠️ Đây là credentials cho **dev local**. Tuyệt đối đổi trước khi đẩy lên cloud thật.

## D.1. Người dùng app (login qua Frontend / Keycloak)

Seed sẵn trong `spring-boot-app/realms/realm-export.json`:

| Vai trò    | Username    | Password      | Email                  |
|------------|-------------|---------------|------------------------|
| Admin app  | `admin1`    | `admin123`    | admin1@example.com     |
| Customer   | `customer1` | `customer123` | customer1@example.com  |

## D.2. Keycloak Admin Console — http://localhost:8181

| User    | Password   |
|---------|------------|
| `admin` | `password` |

> Khi deploy K8s (Phần B/C), password lấy từ `keycloak-admin-password` trong `secrets.yaml` — bạn tự đặt.

## D.3. Eureka / Discovery — http://localhost:8761 (Compose) hoặc port-forward (K8s)

| User     | Password   |
|----------|------------|
| `eureka` | `password` |

> Trong K8s, cấu hình qua biến `eureka-default-zone` trong `secrets.yaml`.

## D.4. Spring Boot Admin Server — http://localhost:8081

Dùng chung `eureka` / `password`.

## D.5. Databases (Compose)

| DB                     | Host:Port        | Database            | User       | Password   |
|------------------------|------------------|---------------------|------------|------------|
| MongoDB                | localhost:27017  | (root)              | `root`     | `S3cret`   |
| Postgres — Keycloak    | localhost:5432   | `keycloak`          | `keycloak` | `password` |
| Postgres — Order       | localhost:5433   | `order-service`     | `ptechie`  | `password` |
| Postgres — Inventory   | localhost:5434   | `inventory-service` | `ptechie`  | `password` |

> Trong K8s, password lấy từ `app-secrets` Secret.

## D.6. ArgoCD (Phần C)

```bash
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d ; echo
```
- User: `admin`
- Password: chuỗi vừa decode

---

# Phần E — Troubleshooting

| Triệu chứng                                                         | Nguyên nhân / Cách xử lý                                                                                  |
|---------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------|
| `mvn: invalid flag: --release` khi build local                      | Host đang dùng JDK 8. Đã fix: build qua Dockerfile, không cần JDK trên host. Hoặc cài JDK 17 (xem CICD_GUIDE) |
| `docker compose up` chậm/treo, OOM                                  | Stack ngốn ~12 GB RAM. Tăng RAM cho WSL2 (`.wslconfig`), hoặc đóng app khác                               |
| Pod `CrashLoopBackOff` ngay sau khi apply manifest                  | Thiếu Secret `app-secrets`. Kiểm tra: `kubectl get secret -n <namespace>`. Apply lại theo B.4–B.5         |
| Pod `ImagePullBackOff`                                              | Tag image chưa có trên Docker Hub, hoặc namespace sai. Kiểm tra `kustomization.yaml` và CI đã build xong  |
| `kubectl` không kết nối được k3d                                    | `k3d kubeconfig merge vshop --kubeconfig-switch-context`                                                   |
| Sync fail `kind: Rollout` không nhận                                | Chưa cài Argo Rollouts. Xem B.2                                                                            |
| ArgoCD app `OutOfSync` mãi                                          | Image Updater chưa commit digest. Kiểm tra `kubectl logs -n argocd deploy/argocd-image-updater`, hoặc sửa tay theo C.7 |
| Workflow CI fail ở step Trivy (frontend)                            | Image frontend có CVE Critical/High. Update dependency hoặc tạm chỉnh `exit-code: '0'` trong workflow     |
| Port 30000/31000 không truy cập được                                | k3d cluster thiếu `--port`. Xoá và tạo lại cluster với đủ 4 port                                          |
| Build Dockerfile fail "no space left on device"                     | `docker system prune -af --volumes` để dọn cache                                                          |
| Eureka 401 Unauthorized                                             | Password `eureka-default-zone` trong secrets không khớp với password Eureka. Sửa cho khớp                 |
| Keycloak khởi động lâu rồi crash                                    | Đợi MySQL/Postgres ready trước. Trong compose là tự `depends_on`; trong K8s phải đợi DB pod Ready trước  |

---

# Phần F — Cleanup

```bash
# Phần A — Compose
cd spring-boot-app && docker compose down -v

# Phần B/C — K8s
kubectl delete -f argocd/production-app.yaml -f argocd/staging-app.yaml 2>/dev/null
kubectl delete -k spring-boot-app/k8s 2>/dev/null
kubectl delete namespace spring-microservices spring-microservices-staging argocd argo-rollouts 2>/dev/null
k3d cluster delete vshop

# Dọn Docker (cẩn thận, xoá nhiều thứ)
docker system prune -af --volumes
```

---

# Phần G — Checklist hoàn thành

**Phần A (Docker Compose):**
- [ ] `docker login` thành công
- [ ] `DOCKER_USERNAME=... ./build-and-push.sh` chạy xanh
- [ ] `docker compose up -d` lên đủ 17 container
- [ ] Mở `http://localhost:3000` thấy frontend
- [ ] Login bằng `customer1` / `customer123` ok

**Phần B (k3d + Kustomize):**
- [ ] Cluster k3d có expose port 30000 và 30085
- [ ] Argo Rollouts CRD đã cài
- [ ] Đã đổi `kaingyn615` → username của bạn
- [ ] Đã copy `secret-example.yaml` → `secrets.yaml` và điền giá trị thật
- [ ] `kubectl apply -k spring-boot-app/k8s` xanh, pods Running
- [ ] Mở `http://localhost:30000` thấy frontend

**Phần C (CI/CD đầy đủ):**
- [ ] GitHub Secrets `DOCKER_USERNAME` + `DOCKER_PASSWORD` đã có
- [ ] ArgoCD đã cài, login UI ok
- [ ] Đã sửa `repoURL` trong `argocd/*-app.yaml`
- [ ] Push `dev` → CI xanh → image lên Docker Hub
- [ ] ArgoCD sync xanh, pods staging/production Running
- [ ] Mở `http://localhost:31000` (staging) và `:30000` (production) đều thấy frontend

---

# Phần H — Tóm tắt 3 đường deploy

| Đặc điểm           | A — Compose          | B — k3d + Kustomize     | C — CI/CD đầy đủ            |
|--------------------|----------------------|-------------------------|----------------------------|
| Mô phỏng prod      | ❌                   | ✅ (giống manifest prod) | ✅✅ (cả pipeline)         |
| Cần GitHub Actions | ❌                   | ❌                      | ✅                         |
| Cần Docker Hub     | ✅ (hoặc build local)| ✅                      | ✅                         |
| Cần K8s            | ❌                   | ✅                      | ✅                         |
| Cần ArgoCD         | ❌                   | ❌                      | ✅                         |
| Tốc độ deploy      | Rất nhanh            | Trung bình              | Chậm (qua CI + sync)       |
| Phù hợp            | Dev/demo nhanh       | Test trước khi lên cloud | Test luồng GitOps end-to-end |

> Khi đã quen với Phần B/C trên k3d, lên cloud (EKS/GKE/AKS) chỉ cần đổi `kubectl context` — không phải sửa CI hay manifest.
