#!/usr/bin/env bash
# 用 Seedance 为案例墙生成真实短片（非静帧运镜）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/web版/merchant-erp/public/short-video-cases"
API="https://mofangdianai.com/erp-api"
MODEL="doubao-seedance-1-5-pro-251215"
mkdir -p "$OUT"

start_one() {
  local id="$1" aspect="$2" prompt="$3"
  local body
  body=$(python3 - <<PY
import json
print(json.dumps({
  "prompt": """$prompt""",
  "flags": {"duration": 5, "aspect_ratio": "$aspect", "resolution": "1080p", "fps": 24},
  "model": "$MODEL",
  "skip_qwen": True,
}, ensure_ascii=False))
PY
)
  local resp task
  resp=$(curl -sS -X POST "$API/meoo-merchant-ai-video-seedance-start" \
    -H "Content-Type: application/json" -d "$body")
  task=$(python3 -c "import json,sys; j=json.loads(sys.argv[1]); print(j.get('taskId') or '')" "$resp")
  if [[ -z "$task" ]]; then
    echo "FAIL start $id: $resp" >&2
    return 1
  fi
  echo "STARTED $id task=$task"
  echo "$task" > "$OUT/_task_$id.txt"
}

poll_one() {
  local id="$1"
  local task
  task=$(cat "$OUT/_task_$id.txt")
  local i=0
  while (( i < 60 )); do
    i=$((i+1))
    local resp phase url
    resp=$(curl -sS "$API/meoo-merchant-ai-video-seedance-status?taskId=$task")
    phase=$(python3 -c "import json,sys; j=json.loads(sys.argv[1]); print(j.get('phase') or '')" "$resp")
    url=$(python3 -c "import json,sys; j=json.loads(sys.argv[1]); print(j.get('videoUrl') or '')" "$resp")
    echo "POLL $id #$i phase=$phase"
    if [[ "$phase" == "succeeded" && -n "$url" ]]; then
      curl -sS -L "$url" -o "$OUT/${id}.mp4"
      # 抽首帧作封面
      ffmpeg -y -i "$OUT/${id}.mp4" -ss 0.3 -vframes 1 -q:v 2 "$OUT/${id}.png" </dev/null 2>/dev/null || true
      ls -lh "$OUT/${id}.mp4"
      return 0
    fi
    if [[ "$phase" == "failed" ]]; then
      echo "FAIL $id: $resp" >&2
      return 1
    fi
    sleep 8
  done
  echo "TIMEOUT $id" >&2
  return 1
}

# 启动全部任务
start_one case-visit-night "9:16" "Night street food market in China, warm lantern glow, steam rising from stalls, handheld follow shot walking through crowd, continuous smooth camera motion, cinematic food vlog, photorealistic, no text"
start_one case-seed-skincare "9:16" "Luxury skincare serum bottle rotating slowly on glass, soft pink light, liquid texture dripping, shallow depth of field, product commercial video, continuous camera orbit, photorealistic, no text"
start_one case-promo-event "9:16" "Bright clothing boutique store interior, shoppers walking through aisle, festive warm lights, dynamic camera push-in, energetic commercial atmosphere video, continuous motion, photorealistic"
start_one case-ambiance-cafe "16:9" "Cozy cafe interior at dusk, steam from latte art, slow cinematic dolly past wooden tables and window light, brand atmosphere film, continuous camera motion, photorealistic, no text"
start_one case-drama-hook "9:16" "Person opening apartment door at night looking surprised, cool hallway light, emotional close-up then pull back, suspenseful short drama hook, continuous camera motion, photorealistic, no text"
start_one case-food-ramen "9:16" "Steaming tonkotsu ramen bowl, chopsticks lifting noodles with broth drip, rising steam, slow orbit macro food video, appetite cinematic, continuous motion, photorealistic, no text"
start_one case-visit-brunch "9:16" "Sunny brunch cafe table, avocado toast and latte, natural window light, gentle push-in camera, lifestyle food video, continuous motion, photorealistic, no text"
start_one case-seed-gadget "9:16" "Modern desk organizer with gadgets, cool blue ambient light, camera slowly orbiting product, tech product demo video, continuous motion, photorealistic, no text"

# 串行轮询下载（避免带宽争抢）
ok=0
for id in case-visit-night case-seed-skincare case-promo-event case-ambiance-cafe case-drama-hook case-food-ramen case-visit-brunch case-seed-gadget; do
  if poll_one "$id"; then ok=$((ok+1)); fi
done

echo "DONE ok=$ok/8"
ls -lh "$OUT"/*.mp4 | head -20
