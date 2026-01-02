#!/bin/bash
curl -X POST http://localhost:8000/api/v1/generate \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"Generate 3 short brandable domain names for AI customer service startup. Each domain should be memorable and professional.\",\"style\":\"brandable\",\"max_tokens\":150,\"temperature\":0.7}" \
  --max-time 50
