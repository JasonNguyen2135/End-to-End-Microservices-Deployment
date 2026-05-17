output "master_public_ips" {
  description = "IP Public của Master Node"
  value       = aws_instance.master[*].public_ip
}

output "worker_public_ips" {
  description = "IP Public của các Worker Nodes"
  value       = aws_instance.workers[*].public_ip
}

output "k3s_token" {
  description = "Pre-shared k3s cluster token"
  value       = random_password.k3s_token.result
  sensitive   = true
}

output "kubeconfig_fetch_cmd" {
  description = "Chạy lệnh này (sau khi master boot ~60s) để lấy kubeconfig về máy local"
  value       = <<-EOT
    ssh -o StrictHostKeyChecking=no -i ~/.ssh/k3s_aws ubuntu@${aws_instance.master[0].public_ip} \
      'sudo cat /etc/rancher/k3s/k3s.yaml' \
      | sed "s/127.0.0.1/${aws_instance.master[0].public_ip}/" > ./kubeconfig
    echo "export KUBECONFIG=$(pwd)/kubeconfig"
  EOT
}
