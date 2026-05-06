# Hướng dẫn CI/CD — End-to-End Microservices Deployment

Tài liệu này mô tả toàn bộ pipeline CI/CD của repo, ý nghĩa từng thành phần và cách chạy/kiểm tra luồng từ **code → image → cluster Kubernetes** thông qua **GitHub Actions + Docker Hub + ArgoCD**.

---

## 1. Tổng quan kiến trúc CI/CD

```
Developer push code
       │
       ▼
┌──────────────────────┐      ┌──────────────────┐
│  GitHub Actions      │ ───► │   SonarQube      │ (quét chất lượng code)
│  (.github/workflows) │      └──────────────────┘
│  - Build (Maven/NPM) │
│  - Sonar scan        │      ┌──────────────────┐
│  - Docker build      │ ───► │   Trivy          │ (quét lỗ hổng image)
│  - Trivy scan        │      └──────────────────┘
│  - Push image        │
│  - Slack notify      │      ┌──────────────────┐
└──────────┬───────────┘ ───► │   Docker Hub     │
           │                  │   kaingyn615/*   │
           ▼                  └─────────┬────────┘
   Push tag `main` / `dev`              │
                                        ▼
                           ┌────────────────────────┐
                           │ ArgoCD Image Updater   │
                           │ (argocd/image-updater) │
                           └─────────┬──────────────┘
                                     │ cập nhật digest
                                     ▼
                       Git repo (k8s/k8s-staging kustomize)
                                     │
                                     ▼
                          ┌──────────────────────┐
                          │ ArgoCD Application   │
                          │ (auto sync, prune,   │
                          │  selfHeal)           │
                          └──────────┬───────────┘
                                     ▼
                          ┌──────────────────────┐
                          │  Kubernetes Cluster  │
                          │  - staging ns        │
                          │  - production ns     │
                          └──────────────────────┘
```

Hai môi trường:

| Môi trường | Branch | Image tag | K8s manifest                | Namespace                         | ArgoCD App                        |
|------------|--------|-----------|-----------------------------|-----------------------------------|-----------------------------------|
| Staging    | `dev`  | `dev`     | `spring-boot-app/k8s-staging` | `spring-microservices-staging`  | `spring-microservices-staging`    |
| Production | `main` | `main`    | `spring-boot-app/k8s`         | `spring-microservices`          | `spring-microservices`            |

---

## 2. Cấu trúc thư mục liên quan tới CI/CD

```
.
├── .github/workflows/                # CI: GitHub Actions
│   ├── admin-server-ci.yaml
│   ├── api-gateway-ci.yaml
│   ├── cart-service-ci.yaml
│   ├── discovery-server-ci.yaml
│   ├── frontend-ci.yaml
│   ├── inventory-service-ci.yaml
│   ├── notification-service-ci.yaml
│   ├── order-service-ci.yaml
│   ├── payment-service-ci.yaml
│   └── product-service-ci.yaml
│
├── argocd/                           # CD: ArgoCD GitOps
│   ├── image-updater.yaml            # ArgoCD Image Updater config
│   ├── staging-app.yaml              # Application cho môi trường staging
│   └── production-app.yaml           # Application cho môi trường production
│
├── spring-boot-app/
│   ├── k8s/                          # Manifest production (tag main)
│   │   └── kustomization.yaml
│   └── k8s-staging/                  # Manifest staging (tag dev)
│       └── kustomization.yaml
│
└── scripts/
    └── check-cicd-argocd-flow.sh     # Script kiểm tra toàn bộ luồng CI/CD + ArgoCD
```

---

## 3. Phần CI — GitHub Actions (`.github/workflows/`)

Có **10 workflow**, mỗi service một file. Tất cả có cùng khung; chỉ khác ngôn ngữ build (Java/Maven cho service Spring Boot vs Node/NPM cho `frontend`).

### 3.1. Trigger
```yaml
on:
  push:
    branches: [ "main", "dev" ]
```
Mỗi lần push lên `main` hoặc `dev`, **tất cả** workflow cùng chạy. Không có path filter, do đó push một service vẫn build lại toàn bộ.

### 3.2. Secrets bắt buộc (cấu hình trong GitHub → Settings → Secrets)

| Secret              | Dùng để                                                  |
|---------------------|----------------------------------------------------------|
| `DOCKER_USERNAME`   | Đăng nhập Docker Hub (user của image, vd `kaingyn615`)   |
| `DOCKER_PASSWORD`   | Token/password Docker Hub                                |
| `SONAR_TOKEN`       | Token SonarQube/SonarCloud                               |
| `SONAR_HOST_URL`    | URL SonarQube server                                     |
| `SLACK_WEBHOOK_URL` | Webhook Slack để gửi noti build success/fail             |

> **Lưu ý:** Mọi step Sonar/Docker/Slack đều có guard `if: env.X != ''`. Nếu thiếu secret thì step đó được skip thay vì làm fail toàn pipeline (xem commit `0015e31 fix(ci): make SonarQube scan optional when secrets are missing`).

### 3.3. Các step trong workflow Java service (vd `cart-service-ci.yaml`)

1. **Checkout code** — `actions/checkout@v3` với `fetch-depth: 0` (Sonar cần full git history).
2. **Set up JDK 17** — `actions/setup-java@v3` distribution `temurin`, có cache Maven.
3. **Cache SonarQube packages** — cache `~/.sonar/cache` để Sonar chạy nhanh hơn.
4. **Build** — `mvn clean verify -DskipTests` (skip test ở giai đoạn build CI; test cần được chạy riêng).
5. **SonarQube Scan** — `mvn sonar:sonar -Dsonar.projectKey=spring-boot-app-<service>` (chỉ chạy khi có token).
6. **Login Docker Hub** — `docker/login-action@v2`.
7. **Build Docker image** — gắn 2 tag:
   - `<DOCKER_USERNAME>/<service>:<branch>` (vd `kaingyn615/cart-service:main`)
   - `<DOCKER_USERNAME>/<service>:<branch>-<sha>` (immutable, dùng để rollback/trace)
8. **Trivy scan** — quét CVE `CRITICAL,HIGH` của image vừa build.
   - `cart-service`/đa số service: `exit-code: '0'` (chỉ cảnh báo, không fail build).
   - `frontend`: `exit-code: '1'` (fail build nếu có lỗ hổng).
9. **Push Docker image** — push cả 2 tag lên Docker Hub.
10. **Slack notification** — gửi tin nhắn success/failure qua webhook.

### 3.4. Workflow Frontend (`frontend-ci.yaml`)

Khác biệt:
- Dùng **Node.js 18**, cache `node_modules` qua `actions/cache@v3`.
- Build: `npm install` → `npm run build`.
- Sonar dùng `sonarsource/sonarqube-scan-action@master` (không phải Maven).
- Trivy `exit-code: '1'` → bắt buộc image frontend không có CVE Critical/High.

---

## 4. Phần CD — ArgoCD GitOps (`argocd/`)

### 4.1. `argocd/staging-app.yaml` và `argocd/production-app.yaml`

Mỗi file là một `Application` của ArgoCD:

| Field             | staging                                | production                          |
|-------------------|----------------------------------------|-------------------------------------|
| `targetRevision`  | `dev`                                  | `main`                              |
| `path`            | `spring-boot-app/k8s-staging`          | `spring-boot-app/k8s`               |
| `namespace`       | `spring-microservices-staging`         | `spring-microservices`              |
| `syncPolicy`      | `automated: { prune: true, selfHeal: true }` + `CreateNamespace=true` |

ArgoCD theo dõi branch tương ứng, render Kustomize và auto-sync vào cluster. `selfHeal: true` đảm bảo cluster luôn khớp với Git (nếu có ai sửa thủ công sẽ bị rollback).

### 4.2. `argocd/image-updater.yaml`

Cấu hình **ArgoCD Image Updater** — tự động viết digest mới của image vào Git khi Docker Hub có tag mới:

- `applicationRefs[0]` (production): theo dõi `kaingyn615/<service>:main`, áp cho app `spring-microservices`.
- `applicationRefs[1]` (staging): theo dõi `kaingyn615/<service>:dev`, áp cho app `spring-microservices-staging`.
- `updateStrategy: digest` — cập nhật theo digest của tag (immutable), không phải theo SemVer.
- `writeBackConfig.method: git` + `writeBackTarget: kustomization` — Image Updater sẽ commit lại file `kustomization.yaml` trong repo. Cần Git credentials có quyền push.

### 4.3. Kustomize manifests

`spring-boot-app/k8s/kustomization.yaml` (production) khai báo image với `newTag: main`; `k8s-staging/kustomization.yaml` dùng `newTag: dev`. Đây là nơi Image Updater sẽ ghi đè khi có image mới.

---

## 5. Script tiện ích — `scripts/check-cicd-argocd-flow.sh`

Script chỉ **kiểm tra** (không build, không push, không sửa CI/CD). Nó xác minh:

- Toolchain `git`, `docker`, `kubectl` (và `gh`, `argocd` nếu có).
- Branch hiện tại có khớp với env (`dev` cho staging, `main` cho production).
- Workflow files có trigger `main/dev`, có Trivy, có dùng `-DskipTests`.
- `kustomization.yaml` đúng tag (`dev` hoặc `main`).
- `kubectl kustomize` render được manifests.
- Cluster có thể truy cập, có namespace `argocd`, có CRD `rollouts.argoproj.io` hay không.
- ArgoCD `Application` đã được apply chưa.
- (Optional) Apply manifest, sync app, watch pods.

### Cách dùng

```bash
# Kiểm tra môi trường staging
./scripts/check-cicd-argocd-flow.sh --env staging

# Kiểm tra + apply Application + watch pods
./scripts/check-cicd-argocd-flow.sh --env staging --apply-app --watch-pods

# Kiểm tra production + apply + sync qua argocd CLI
./scripts/check-cicd-argocd-flow.sh --env production --apply-app --sync-app
```

---

## 6. Quy trình chạy CI/CD đầu-cuối

### 6.1. Chuẩn bị một lần

1. **GitHub Secrets:** thêm `DOCKER_USERNAME`, `DOCKER_PASSWORD`, `SONAR_TOKEN`, `SONAR_HOST_URL`, `SLACK_WEBHOOK_URL` vào repo settings.
2. **Cluster Kubernetes** đã sẵn sàng (k3d/EKS/Kubespray) và `kubectl` trỏ đúng context.
3. **Cài ArgoCD** vào cluster:
   ```bash
   kubectl create namespace argocd
   kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
   ```
4. **Cài Argo Rollouts CRD** (do `canary-rollouts.yaml` cần):
   ```bash
   kubectl create namespace argo-rollouts
   kubectl apply -n argo-rollouts -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml
   ```
5. **Cài ArgoCD Image Updater** (nếu muốn tự động bump digest):
   ```bash
   kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj-labs/argocd-image-updater/stable/manifests/install.yaml
   kubectl apply -f argocd/image-updater.yaml
   ```
6. **Apply ArgoCD Applications:**
   ```bash
   kubectl apply -f argocd/staging-app.yaml
   kubectl apply -f argocd/production-app.yaml
   ```

### 6.2. Vòng phát triển hằng ngày

**Staging (branch `dev`):**

```bash
git checkout dev
# ... sửa code ...
git add . && git commit -m "feat: ..."
git push origin dev
```

→ GitHub Actions build/scan/push image với tag `dev`-`<sha>`
→ Image Updater cập nhật `k8s-staging/kustomization.yaml`
→ ArgoCD auto-sync vào namespace `spring-microservices-staging`.

Theo dõi:
```bash
gh run list --branch dev --limit 5
kubectl get pods -n spring-microservices-staging -w
argocd app get spring-microservices-staging
```

**Production (branch `main`):**

Merge từ `dev` qua PR vào `main`. Cùng quy trình nhưng deploy vào namespace `spring-microservices`.

### 6.3. Kiểm tra nhanh sau khi push

```bash
./scripts/check-cicd-argocd-flow.sh --env staging
```

### 6.4. URL test

| Môi trường | Frontend                | API Gateway              |
|------------|-------------------------|--------------------------|
| Staging    | `http://localhost:31000`| `http://localhost:31085` |
| Production | `http://localhost:30000`| `http://localhost:30085` |

---

## 7. Troubleshooting

| Triệu chứng                                  | Nguyên nhân thường gặp                                                                 | Xử lý                                                                                         |
|----------------------------------------------|----------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------|
| Workflow fail ở step Sonar                   | Thiếu `SONAR_TOKEN` hoặc `SONAR_HOST_URL`                                              | Thêm secret hoặc bỏ qua — guard `if` đã skip nếu rỗng                                         |
| Workflow fail ở step Trivy (`frontend`)      | Image có CVE Critical/High                                                             | Update base image hoặc dependency; tạm thời chỉnh `exit-code: '0'`                            |
| Image push được nhưng cluster không update   | Chưa cài Image Updater hoặc credentials Git không có quyền push                        | Xem log `kubectl logs -n argocd deploy/argocd-image-updater`                                  |
| ArgoCD app `OutOfSync` vĩnh viễn             | Manual edit trên cluster bị `selfHeal` rollback — kiểm tra commit Image Updater có push không | `argocd app diff <app>` để xem khác biệt                                                      |
| Sync fail do `Rollout` CRD                   | Chưa cài Argo Rollouts                                                                 | Cài Argo Rollouts theo bước 6.1.4                                                             |
| Mọi push đều build hết 10 service            | Workflow chưa có path filter                                                           | Thêm `paths:` filter vào từng workflow nếu muốn tối ưu CI                                     |
| Test bị skip                                 | Maven build dùng `-DskipTests`                                                         | Thêm job test riêng hoặc bỏ flag (chú ý thời gian build)                                      |

---

## 8. Tóm tắt vai trò từng file

| File                                            | Vai trò                                                                          |
|-------------------------------------------------|----------------------------------------------------------------------------------|
| `.github/workflows/<service>-ci.yaml`           | CI từng service: build → Sonar → Docker → Trivy → push → Slack                   |
| `argocd/staging-app.yaml`                       | ArgoCD Application cho staging (branch `dev`)                                    |
| `argocd/production-app.yaml`                    | ArgoCD Application cho production (branch `main`)                                |
| `argocd/image-updater.yaml`                     | Tự động bump digest image trong Git khi Docker Hub có tag mới                    |
| `spring-boot-app/k8s/kustomization.yaml`        | Tập manifest production, image tag `main`                                        |
| `spring-boot-app/k8s-staging/kustomization.yaml`| Tập manifest staging, image tag `dev`                                            |
| `scripts/check-cicd-argocd-flow.sh`             | Script audit: kiểm tra toolchain, workflow, kustomize, cluster, ArgoCD app       |
