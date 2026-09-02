# SERVICES=(              # 定义一个数组
#   "cloud-provider-payment:provider"
#   "cloud-consumer-order:consumer"
# )
# for entry in "${SERVICES[@]}"; do
#   echo "$entry"
# done


## 一键添加 #
# sed -E -i 's/^(#+)/#\1/' tmp.md



curl -i http://localhost:9001/consumer/payment/get/4 


docker cp "./tmp.md" cloud-consumer-order:/app/
docker exec cloud-consumer-order  ls /app -l

docker compose -f ./deploy/docker-compose.yml logs -f consumer
docker compose --project-directory ./deploy logs -f consumer
# :docker compose --project-directory ./deploy logs -f provider

# docker compose rm -f -s cloud-consumer-order
# docker compose up -d cloud-consumer-order
# docker exec cloud-consumer-order pkill -f "java.*cloud-provider"

#  curl -X POST http://localhost/consumer/payment/get/1 -H "Content-Type: application/json" -d '{"id": 1}'
