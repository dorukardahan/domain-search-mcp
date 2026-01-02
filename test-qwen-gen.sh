#!/bin/bash
curl -X POST http://localhost:8000/api/v1/generate \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"Generate 3 brandable domain names for AI startup\",\"style\":\"brandable\",\"max_tokens\":200,\"temperature\":0.7}" \
  --max-time 35
