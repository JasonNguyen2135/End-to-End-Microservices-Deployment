terraform {
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "random_password" "k3s_token" {
  length  = 48
  special = false
}

resource "aws_key_pair" "this" {
  key_name   = var.key_name
  public_key = file(pathexpand(var.public_key_path))
}

resource "aws_security_group" "k8s_sg" {
  name        = "k3s_security_group"
  description = "Security group for k3s cluster"

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "ICMP"
    from_port   = -1
    to_port     = -1
    protocol    = "icmp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Kubernetes API"
    from_port   = 6443
    to_port     = 6443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP (ingress)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS (ingress)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "NodePort range"
    from_port   = 30000
    to_port     = 32767
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "All traffic within SG (kubelet, flannel vxlan, etcd, etc.)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    self        = true
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_instance" "master" {
  count                       = 1
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.master_instance_type
  key_name                    = aws_key_pair.this.key_name
  vpc_security_group_ids      = [aws_security_group.k8s_sg.id]
  associate_public_ip_address = true

  user_data = <<-EOT
    #!/bin/bash
    set -euxo pipefail
    PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)
    curl -sfL https://get.k3s.io | \
      INSTALL_K3S_VERSION="${var.k3s_version}" \
      K3S_TOKEN="${random_password.k3s_token.result}" \
      sh -s - server \
        --write-kubeconfig-mode=644 \
        --tls-san="$PUBLIC_IP"
  EOT

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
  }

  tags = { Name = "k3s-master-${count.index + 1}" }
}

resource "aws_instance" "workers" {
  count                       = var.worker_count
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.worker_instance_type
  key_name                    = aws_key_pair.this.key_name
  vpc_security_group_ids      = [aws_security_group.k8s_sg.id]
  associate_public_ip_address = true
  depends_on                  = [aws_instance.master]

  user_data = <<-EOT
    #!/bin/bash
    set -euxo pipefail
    MASTER_URL="https://${aws_instance.master[0].private_ip}:6443"
    until curl -ks "$MASTER_URL" >/dev/null; do
      echo "waiting for k3s server at $MASTER_URL..."
      sleep 5
    done
    curl -sfL https://get.k3s.io | \
      INSTALL_K3S_VERSION="${var.k3s_version}" \
      K3S_URL="$MASTER_URL" \
      K3S_TOKEN="${random_password.k3s_token.result}" \
      sh -
  EOT

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
  }

  tags = { Name = "k3s-worker-${count.index + 1}" }
}
