# Domain Name Model - CRFT Training 🚀

5 adımda CRFT ile modelini eğit!

## Neden CRFT?

| Metrik | Standard LoRA | CRFT |
|--------|---------------|------|
| Eğitilen parametreler | ~1% | ~0.016% |
| GPU bellek | Yüksek | Düşük |
| Overfitting riski | Orta | Düşük |
| Eğitim süresi | Uzun | Kısa |

CRFT sadece "reasoning-critical" (orta) katmanları eğitir.

---

## Adım 1: RunPod'da GPU Kirala

1. https://www.runpod.io/console/pods
2. **+ Deploy** → GPU seç:
   - **RTX 4090** (24GB) → $0.44/saat → Önerilen
   - **A100 80GB** → $1.99/saat → Büyük modeller için
3. Template: `runpod/pytorch:2.1.0-py3.10-cuda12.1.1-devel-ubuntu22.04`
4. **Deploy**

## Adım 2: SSH ile Bağlan

```bash
# RunPod panelinden "Connect" → SSH komutunu kopyala
ssh root@<POD_IP> -p <PORT> -i ~/.ssh/id_ed25519
```

## Adım 3: Kurulum (Otomatik)

```bash
cd /workspace
git clone https://github.com/dorukardahan/domain-search-mcp.git
cd domain-search-mcp
bash training/setup_runpod.sh
```

## Adım 4: Dataset'i Yükle

Local terminalinde:

```bash
cd domain-search-mcp
scp -P <PORT> training/data/train.jsonl root@<POD_IP>:/workspace/domain-search-mcp/training/data/
scp -P <PORT> training/data/val.jsonl root@<POD_IP>:/workspace/domain-search-mcp/training/data/
```

## Adım 5: Eğitimi Başlat

### Hızlı Test (5 dakika, ~$0.50)

```bash
python training/train_crft.py \
  --model Qwen/Qwen2.5-7B-Instruct \
  --data training/data/train.jsonl \
  --val_data training/data/val.jsonl \
  --output training/output-test \
  --max_samples 500 \
  --epochs 1
```

### Full Training (4-6 saat, ~$30-50)

```bash
python training/train_crft.py \
  --model Qwen/Qwen2.5-14B-Instruct \
  --data training/data/train.jsonl \
  --val_data training/data/val.jsonl \
  --output training/output \
  --epochs 1 \
  --batch_size 4 \
  --grad_accum 8
```

### WandB ile İzleme (Opsiyonel)

```bash
wandb login  # API key gir
python training/train_crft.py \
  ... \
  --wandb_project domain-crft
```

---

## Eğitim Bittikten Sonra

### 1. Test Et

```bash
python training/test_model.py \
  --model_path training/output \
  --prompt "Generate 5 brandable names for a crypto wallet app"
```

### 2. Modeli İndir

Local terminalinde:

```bash
scp -P <PORT> -r root@<POD_IP>:/workspace/domain-search-mcp/training/output ./qwen-domain-crft
```

### 3. Evaluate Et

```bash
# RunPod'da veya local'de
python training/run_evaluation.py --dataset test --sample 100
```

---

## 💰 Maliyet Tahmini

| GPU | Saatlik | 5 saat (Full) |
|-----|---------|---------------|
| RTX 4090 | $0.44 | ~$2.20 |
| A6000 | $0.79 | ~$4.00 |
| A100 40GB | $1.49 | ~$7.50 |
| A100 80GB | $1.99 | ~$10.00 |

**İpucu**: RTX 4090 ile 14B model eğitebilirsin (4-bit quantization sayesinde).

---

## 🆘 Sorun Giderme

### "CUDA out of memory"

```bash
# Batch size'ı düşür, gradient accumulation'ı artır
--batch_size 2 --grad_accum 16
```

### "Model not found"

```bash
# HuggingFace login
huggingface-cli login
# Token: https://huggingface.co/settings/tokens
```

### Eğitim çok yavaş

```bash
# Daha güçlü GPU al veya sample sayısını azalt
--max_samples 20000
```

---

## 📊 Baseline Skorlar (Training Öncesi)

```
Constraint Satisfaction: 100%
Diversity:               76.4%
Pronounceability:        88.3%
Brandability:            73.4%
---
COMBINED SCORE:          8.57/10
```

**Hedef**: Training sonrası 9.0+ / 10

---

## 🎯 Sonraki Adımlar

1. ✅ CRFT Training tamamlandı
2. 🧪 Test ve evaluate et
3. 📤 Together.ai'ya yükle (inference için)
4. 🚀 MCP server'a entegre et

---

## Dosya Yapısı

```
training/
├── train_crft.py        # CRFT training scripti
├── test_model.py        # Model test scripti
├── run_evaluation.py    # Eval framework
├── setup_runpod.sh      # RunPod kurulum
├── requirements.txt     # Python dependencies
├── data/
│   ├── train.jsonl      # 80k samples
│   ├── val.jsonl        # 10k samples
│   └── test.jsonl       # 10k samples
├── eval/
│   ├── constraint_satisfaction.py
│   ├── diversity_metrics.py
│   ├── pronounceability.py
│   └── premium_score.py
└── results/
    └── baseline_dataset_quality.json
```

**Başarılar! 🚀**
