# Vast.ai'da Qwen 2.5 7B QLora Eğitimi - Basit Kurulum

Bu rehber, domain name generation için Qwen 2.5 7B modelini vast.ai üzerinde fine-tune etmek için adım adım talimatlar içerir.

## Gereksinimler

- **GPU**: RTX 4090 veya A6000 (24GB VRAM minimum)
- **Disk**: 100GB+ boş alan
- **RAM**: 32GB+ sistem RAM önerilir

## Adım 1: Vast.ai'da Instance Oluşturma

### 1.1 Vast.ai'a Giriş
1. https://vast.ai adresine git
2. Hesap oluştur ve balance yükle ($10-20 yeterli)

### 1.2 GPU Seçimi
1. Sol menüden **"Search"** seçeneğine tıkla
2. Filtreleri ayarla:
   ```
   GPU: RTX 4090 veya A6000 (RTX 3090 da olur ama daha yavaş)
   VRAM: 24GB minimum
   Disk: 100GB+
   DLPerf: > 70 (güvenilir hostlar için)
   ```
3. Fiyata göre sırala ($/hr düşük olanlar)
4. **"RENT"** butonuna tıkla

### 1.3 Instance Ayarları
Docker image seç:
```
pytorch/pytorch:2.1.0-cuda12.1-cudnn8-devel
```

veya daha güncel:
```
nvidia/cuda:12.1.0-devel-ubuntu22.04
```

Launch mode: **SSH**

## Adım 2: Instance'a Bağlanma

### 2.1 SSH Bağlantısı
Vast.ai panelinden instance'ınızı bulun ve **"SSH"** butonuna tıklayın. SSH komutu şöyle görünür:

```bash
ssh -p PORT root@HOST.vast.ai -L 8080:localhost:8080
```

Bu komutu terminalinize kopyalayın ve çalıştırın.

### 2.2 GPU Kontrolü
Bağlandıktan sonra GPU'yu kontrol edin:

```bash
nvidia-smi
```

## Adım 3: Otomatik Kurulum (Kolay Yol)

Repository'yi indirin ve kurulum scriptini çalıştırın:

```bash
# Git ve temel araçları kur (eğer yoksa)
apt-get update && apt-get install -y git wget

# Repository'yi klonla
cd /workspace
git clone https://github.com/dorukardahan/domain-search-mcp.git
cd domain-search-mcp

# Kurulum scriptini çalıştır
chmod +x training/setup_vast.sh
bash training/setup_vast.sh
```

Bu script otomatik olarak:
- Python ve gerekli kütüphaneleri kurar
- Dataset'i doğrular
- Training için environment hazırlar

## Adım 4: Eğitimi Başlatma

### 4.1 Environment Ayarları

```bash
cd /workspace/domain-search-mcp

# .env dosyasını oluştur (opsiyonel)
cp training/.env.example training/.env
# HuggingFace token gerekirse ekle:
# echo "HF_TOKEN=your_token_here" >> training/.env
```

### 4.2 Eğitimi Başlat

**Hızlı Test (1000 örnek, 10 dakika):**
```bash
python training/qlora_train.py \
  --model Qwen/Qwen2.5-7B-Instruct \
  --data data/domain-dataset-100k.jsonl \
  --output training/output-test \
  --max_seq_len 512 \
  --batch_size 4 \
  --grad_accum 8 \
  --epochs 1 \
  --max_samples 1000
```

**Full Eğitim (100k örnek, ~6-8 saat RTX 4090'da):**
```bash
python training/qlora_train.py \
  --model Qwen/Qwen2.5-7B-Instruct \
  --data data/domain-dataset-100k.jsonl \
  --output training/output \
  --max_seq_len 512 \
  --batch_size 8 \
  --grad_accum 4 \
  --epochs 1 \
  --lr 2e-4
```

### 4.3 Eğitimi İzleme

Başka bir terminal açın ve log'ları izleyin:

```bash
tail -f training/output/trainer_log.txt
```

veya training klasörünü kontrol edin:

```bash
ls -lh training/output/
```

## Adım 5: Eğitim Tamamlandıktan Sonra

### 5.1 Modeli İndirme

Eğitim bittiğinde, modeli local makinenize indirin:

```bash
# Local terminalinizde (vast.ai instance'ında DEĞİL):
scp -P PORT -r root@HOST.vast.ai:/workspace/domain-search-mcp/training/output ./qwen-domain-lora
```

### 5.2 Modeli Test Etme

Vast.ai instance'ında test edin:

```bash
cd /workspace/domain-search-mcp
python training/test_model.py \
  --model_path training/output \
  --prompt "Generate 5 brandable domain names for an AI assistant product"
```

## Troubleshooting

### Problem: CUDA Out of Memory

**Çözüm**: Batch size ve sequence length'i azalt:

```bash
python training/qlora_train.py \
  --model Qwen/Qwen2.5-7B-Instruct \
  --data data/domain-dataset-100k.jsonl \
  --output training/output \
  --max_seq_len 384 \
  --batch_size 4 \
  --grad_accum 8 \
  --epochs 1
```

### Problem: Model indirilemiyor (HuggingFace)

**Çözüm**: HuggingFace token ekle:

```bash
# huggingface-cli login komutu çalıştır
pip install -U huggingface_hub
huggingface-cli login
# Token'ı gir: https://huggingface.co/settings/tokens
```

### Problem: Dataset bulunamıyor

**Çözüm**: Dataset'i manuel indir:

```bash
cd /workspace/domain-search-mcp
# Eğer git'te yoksa, local'den upload et:
# scp -P PORT data/domain-dataset-100k.jsonl root@HOST.vast.ai:/workspace/domain-search-mcp/data/
```

### Problem: Eğitim çok yavaş

**Çözüm 1**: Daha güçlü GPU kirala (RTX 4090 > RTX 3090)

**Çözüm 2**: Gradient accumulation artır, batch size azalt:

```bash
--batch_size 2 --grad_accum 16
```

## Maliyet Tahmini

| GPU | $/saat | Süre (100k) | Toplam Maliyet |
|-----|--------|-------------|----------------|
| RTX 4090 | $0.40-0.60 | 6-8 saat | $2.40-4.80 |
| A6000 | $0.50-0.70 | 7-9 saat | $3.50-6.30 |
| RTX 3090 | $0.30-0.50 | 10-12 saat | $3.00-6.00 |

**Not**: Fiyatlar değişkenlik gösterir. İlk denemede 1000 sample ile test yapın!

## Sonraki Adımlar

Eğitim başarılı olduktan sonra:

1. **Model performansını değerlendir**: Test dataset ile kalite kontrol
2. **MCP'ye entegre et**: `src/utils/semantic-engine.ts` dosyasını güncelle
3. **API endpoint oluştur**: Fine-tuned model için inference endpoint
4. **Production'a taşı**: Replicate, HuggingFace Inference, veya kendi sunucun

## Hızlı Komutlar (Cheatsheet)

```bash
# Instance'a bağlan
ssh -p PORT root@HOST.vast.ai

# GPU kontrol
nvidia-smi

# Eğitimi başlat (test)
python training/qlora_train.py --model Qwen/Qwen2.5-7B-Instruct --data data/domain-dataset-100k.jsonl --output training/output-test --batch_size 4 --grad_accum 8 --max_samples 1000

# Eğitimi başlat (full)
python training/qlora_train.py --model Qwen/Qwen2.5-7B-Instruct --data data/domain-dataset-100k.jsonl --output training/output --batch_size 8 --grad_accum 4 --epochs 1

# Log izle
tail -f training/output/trainer_log.txt

# Modeli indir (local terminal)
scp -P PORT -r root@HOST.vast.ai:/workspace/domain-search-mcp/training/output ./qwen-domain-lora

# Instance'ı durdur (Vast.ai panel > Destroy)
```

## Yardım

Sorun yaşarsanız:
- GitHub Issues: https://github.com/dorukardahan/domain-search-mcp/issues
- Vast.ai Docs: https://vast.ai/docs/
- HuggingFace Docs: https://huggingface.co/docs/transformers/
