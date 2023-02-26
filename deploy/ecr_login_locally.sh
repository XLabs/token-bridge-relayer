#!/bin/bash

kubectl create secret docker-registry ecr \
  --namespace=token-bridge-relayer \
  --docker-username=AWS \
  --docker-password=$(aws ecr get-login-password --region us-east-2) \
  --docker-server=581679387567.dkr.ecr.us-east-2.amazonaws.com
