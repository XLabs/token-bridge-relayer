#! /bin/sh

kubectl delete secret token-bridge-relayer-redis --ignore-not-found --namespace=token-bridge-relayer

kubectl create secret generic token-bridge-relayer-redis \
    --from-literal=RELAYER_ENGINE_REDIS_HOST=${RELAYER_ENGINE_REDIS_HOST} \
    --from-literal=RELAYER_ENGINE_REDIS_USERNAME=${RELAYER_ENGINE_REDIS_USERNAME} \
    --from-literal=RELAYER_ENGINE_REDIS_PASSWORD=${RELAYER_ENGINE_REDIS_PASSWORD} \
    --namespace=token-bridge-relayer
