#!/bin/bash
set -e

echo "========================================="
echo "Domain Search MCP - Vast.ai Setup"
echo "========================================="
echo ""

# Renk kodları
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Python version kontrolü
echo -e "${YELLOW}[1/6] Python versiyonu kontrol ediliyor...${NC}"
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Python3 bulunamadı, yükleniyor...${NC}"
    apt-get update
    apt-get install -y python3 python3-pip python3-venv
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
echo -e "${GREEN}✓ Python $PYTHON_VERSION bulundu${NC}"

# CUDA kontrol
echo -e "\n${YELLOW}[2/6] CUDA kontrol ediliyor...${NC}"
if command -v nvidia-smi &> /dev/null; then
    nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
    echo -e "${GREEN}✓ CUDA kullanılabilir${NC}"
else
    echo -e "${RED}⚠ nvidia-smi bulunamadı, GPU kullanılamayabilir${NC}"
fi

# Virtual environment oluştur
echo -e "\n${YELLOW}[3/6] Python virtual environment oluşturuluyor...${NC}"
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
    echo -e "${GREEN}✓ Virtual environment oluşturuldu${NC}"
else
    echo -e "${GREEN}✓ Virtual environment zaten mevcut${NC}"
fi

# Virtual env'i aktifleştir ve bağımlılıkları kur
echo -e "\n${YELLOW}[4/6] Bağımlılıklar yükleniyor...${NC}"
source .venv/bin/activate

pip install --upgrade pip setuptools wheel
pip install -r training/requirements.txt

echo -e "${GREEN}✓ Bağımlılıklar yüklendi${NC}"

# Dataset kontrolü
echo -e "\n${YELLOW}[5/6] Dataset kontrol ediliyor...${NC}"
DATASET_PATH="data/domain-dataset-100k.jsonl"

if [ -f "$DATASET_PATH" ]; then
    LINES=$(wc -l < "$DATASET_PATH")
    SIZE=$(du -h "$DATASET_PATH" | cut -f1)
    echo -e "${GREEN}✓ Dataset bulundu: $LINES satır, $SIZE${NC}"

    # İlk satırı göster
    echo -e "\n${YELLOW}Dataset örneği (ilk satır):${NC}"
    head -1 "$DATASET_PATH" | python3 -m json.tool 2>/dev/null || head -1 "$DATASET_PATH"
else
    echo -e "${RED}✗ Dataset bulunamadı: $DATASET_PATH${NC}"
    echo -e "${YELLOW}Dataset'i local'den upload etmeniz gerekiyor:${NC}"
    echo -e "scp -P PORT data/domain-dataset-100k.jsonl root@HOST.vast.ai:/workspace/domain-search-mcp/data/"
    exit 1
fi

# .env dosyası kontrolü
echo -e "\n${YELLOW}[6/6] Environment ayarları kontrol ediliyor...${NC}"
if [ ! -f "training/.env" ]; then
    cp training/.env.example training/.env
    echo -e "${GREEN}✓ .env dosyası oluşturuldu (training/.env)${NC}"
    echo -e "${YELLOW}HuggingFace token gerekirse şu dosyayı düzenleyin: training/.env${NC}"
else
    echo -e "${GREEN}✓ .env dosyası mevcut${NC}"
fi

# Özet
echo -e "\n========================================="
echo -e "${GREEN}Kurulum tamamlandı!${NC}"
echo -e "=========================================\n"

echo -e "${YELLOW}Hızlı test için (1000 örnek, ~10 dakika):${NC}"
echo -e "python training/qlora_train.py \\"
echo -e "  --model Qwen/Qwen2.5-7B-Instruct \\"
echo -e "  --data data/domain-dataset-100k.jsonl \\"
echo -e "  --output training/output-test \\"
echo -e "  --batch_size 4 \\"
echo -e "  --grad_accum 8 \\"
echo -e "  --max_samples 1000"

echo -e "\n${YELLOW}Full eğitim için (100k örnek, ~6-8 saat):${NC}"
echo -e "python training/qlora_train.py \\"
echo -e "  --model Qwen/Qwen2.5-7B-Instruct \\"
echo -e "  --data data/domain-dataset-100k.jsonl \\"
echo -e "  --output training/output \\"
echo -e "  --batch_size 8 \\"
echo -e "  --grad_accum 4 \\"
echo -e "  --epochs 1"

echo -e "\n${YELLOW}Daha detaylı bilgi için:${NC}"
echo -e "cat training/VAST_AI_SETUP.md"
echo ""
