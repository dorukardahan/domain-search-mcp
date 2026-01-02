# Qwen Domain Model - Hızlı Başlangıç 🚀

5 adımda modelini eğit!

## Adım 1: Vast.ai'da GPU Kirala

1. https://vast.ai/console/create/
2. **RTX 4090** veya **A6000** seç (24GB VRAM)
3. Docker image: `pytorch/pytorch:2.1.0-cuda12.1-cudnn8-devel`
4. **RENT** → instance başlasın

## Adım 2: SSH ile Bağlan

```bash
ssh -p PORT root@HOST.vast.ai
```

(PORT ve HOST bilgilerini vast.ai panelinden kopyala)

## Adım 3: Kurulum Yap (Otomatik)

```bash
apt-get update && apt-get install -y git
cd /workspace
git clone https://github.com/dorukardahan/domain-search-mcp.git
cd domain-search-mcp
bash training/setup_vast.sh
```

## Adım 4: Eğitimi Başlat

### Hızlı Test (10 dakika, $0.10)

```bash
python training/qlora_train.py \
  --model Qwen/Qwen2.5-7B-Instruct \
  --data data/domain-dataset-100k.jsonl \
  --output training/output-test \
  --batch_size 4 \
  --grad_accum 8 \
  --max_samples 1000
```

### Full Eğitim (6-8 saat, $3-5)

```bash
python training/qlora_train.py \
  --model Qwen/Qwen2.5-7B-Instruct \
  --data data/domain-dataset-100k.jsonl \
  --output training/output \
  --batch_size 8 \
  --grad_accum 4 \
  --epochs 1
```

## Adım 5: Modeli İndir (Eğitim Bitince)

Local terminalinde:

```bash
scp -P PORT -r root@HOST.vast.ai:/workspace/domain-search-mcp/training/output ./qwen-domain-lora
```

## ✅ Bitti!

Modelin hazır. Şimdi test et:

```bash
# Vast.ai'da (eğitim bittikten sonra)
python training/test_model.py \
  --model_path training/output \
  --prompt "Generate 5 brandable names for a crypto wallet app"
```

---

## 🆘 Sorun mu var?

### "CUDA out of memory"
→ Batch size'ı küçült: `--batch_size 2 --grad_accum 16`

### "Dataset not found"
→ Dataset'i upload et:
```bash
# Local terminalinde
cd domain-search-mcp
scp -P PORT data/domain-dataset-100k.jsonl root@HOST.vast.ai:/workspace/domain-search-mcp/data/
```

### "Model download failed"
→ HuggingFace login yap:
```bash
pip install -U huggingface_hub
huggingface-cli login
# Token: https://huggingface.co/settings/tokens
```

---

## 💰 Maliyet

| Test (1000 örnek) | Full (100k örnek) |
|-------------------|-------------------|
| ~10 dakika        | ~6-8 saat         |
| ~$0.10            | ~$3-5             |

**İpucu**: İlk denemede mutlaka test yap!

---

## 📚 Detaylı Dokümantasyon

- **Full setup guide**: `training/VAST_AI_SETUP.md`
- **Training README**: `training/README.md`
- **Troubleshooting**: `training/VAST_AI_SETUP.md#troubleshooting`

---

## 🎯 Sonraki Adımlar

1. ✅ Model eğitildi
2. 🧪 Test et: `python training/test_model.py`
3. 📥 İndir: `scp` ile local'e al
4. 🚀 MCP'ye entegre et
5. 🎉 Production'a taşı (Replicate, HF Inference, vs.)

**Başarılar! 🚀**
