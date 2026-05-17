variable "aws_region" {
  description = "AWS region to deploy resources in"
  type        = string
  default     = "ap-southeast-1"
}

variable "key_name" {
  description = "Name to assign to the EC2 key pair created by Terraform"
  type        = string
  default     = "k3s-aws"
}

variable "public_key_path" {
  description = "Path to local SSH public key uploaded as EC2 key pair"
  type        = string
  default     = "~/.ssh/k3s_aws.pub"
}

variable "master_instance_type" {
  description = "EC2 instance type for the master node (k3s server + ArgoCD controllers)"
  type        = string
  default     = "c7i-flex.large"
}

variable "worker_instance_type" {
  description = "EC2 instance type for worker nodes (Spring Boot microservices)"
  type        = string
  default     = "c7i-flex.large"
}

variable "k3s_version" {
  description = "k3s version channel or pinned version (e.g. v1.30.5+k3s1)"
  type        = string
  default     = "v1.30.5+k3s1"
}

variable "worker_count" {
  description = "Number of k3s agent (worker) nodes"
  type        = number
  default     = 2
}
