#!/bin/bash
# Google GenAI API Demo Script
# Run with: asciinema rec -c "./google-script.sh" demo.cast

set -e

# Colors for visibility
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper to echo command before running (with 1s pause)
run() {
  echo -e "${YELLOW}\$ $@${NC}"
  sleep 1
  "$@"
}

echo -e "${CYAN}=== Google GenAI API Demo ===${NC}"
sleep 2

#############################################
# Part 1: Introduction (20 seconds)
#############################################
clear
echo -e "${GREEN}# Show the CLI help${NC}"
sleep 1
run google-genai --help || true
sleep 4

echo ""
echo -e "${GREEN}# Show usage examples${NC}"
sleep 1
run google-genai --examples
sleep 6

#############################################
# Part 2: Gemini Image Generation (35 seconds)
#############################################
clear
echo -e "${GREEN}# Gemini 2.5 Flash - Text-to-image${NC}"
sleep 1
run google-genai --gemini \
  --prompt "A majestic snow leopard on a mountain peak at golden hour" \
  --aspect-ratio "16:9"
sleep 3

echo ""
echo -e "${GREEN}# Gemini - Image-to-image transformation${NC}"
sleep 1
GEMINI_IMG=$(ls -t datasets/google/gemini-2.5-flash-image/*.png 2>/dev/null | head -1)
echo -e "${YELLOW}\$ google-genai --gemini --prompt \"Transform into watercolor painting\" --input-image \"<gemini-image>\"${NC}"
sleep 1
google-genai --gemini \
  --prompt "Transform into watercolor painting style" \
  --input-image "$GEMINI_IMG" \
  --aspect-ratio "16:9"
sleep 3

#############################################
# Part 3: Gemini 3 Pro (30 seconds)
#############################################
clear
echo -e "${GREEN}# Gemini 3 Pro - Latest preview model${NC}"
sleep 1
run google-genai --gemini-3-pro \
  --prompt "A serene Japanese garden with cherry blossoms and a koi pond" \
  --aspect-ratio "16:9"
sleep 3

echo ""
echo -e "${GREEN}# Gemini 3 Pro - Image editing${NC}"
sleep 1
GEMINI3_IMG=$(ls -t datasets/google/gemini-3-pro-image-preview/*.png 2>/dev/null | head -1)
echo -e "${YELLOW}\$ google-genai --gemini-3-pro --prompt \"Add a red bridge\" --input-image \"<gemini3-image>\"${NC}"
sleep 1
google-genai --gemini-3-pro \
  --prompt "Add a traditional red wooden bridge over the pond" \
  --input-image "$GEMINI3_IMG" \
  --aspect-ratio "16:9"
sleep 3

#############################################
# Part 4: Imagen Generation (25 seconds)
#############################################
clear
echo -e "${GREEN}# Imagen 4 - High quality generation${NC}"
sleep 1
run google-genai --imagen \
  --prompt "Futuristic cityscape with flying vehicles at sunset" \
  --aspect-ratio "16:9"
sleep 3

echo ""
echo -e "${GREEN}# Imagen - Multiple images${NC}"
sleep 1
run google-genai --imagen \
  --prompt "Character design: futuristic robot companion" \
  --number-of-images 2 \
  --aspect-ratio "1:1"
sleep 3

echo ""
echo -e "${GREEN}# Show generated images${NC}"
sleep 1
run tree datasets/google/ -L 2 -I '*.json' --noreport
sleep 3

#############################################
# Part 5: Veo Video Generation (40 seconds)
#############################################
clear
echo -e "${GREEN}# Veo 3.1 - Text-to-video generation${NC}"
sleep 1
run google-genai --veo \
  --prompt "A butterfly landing on a flower in a sunny garden" \
  --veo-aspect-ratio "16:9" \
  --veo-duration 4 \
  --veo-model "veo-3.1-fast-generate-preview"
sleep 3

echo ""
echo -e "${GREEN}# Veo - Image-to-video animation${NC}"
sleep 1
IMAGEN_IMG=$(ls -t datasets/google/imagen-4.0-generate-001/*.png 2>/dev/null | head -1)
echo -e "${YELLOW}\$ google-genai --veo --prompt \"Camera pans across the city\" --veo-image \"<imagen-image>\" --veo-duration 4${NC}"
sleep 1
google-genai --veo \
  --prompt "Camera slowly pans across the cityscape as vehicles fly by" \
  --veo-image "$IMAGEN_IMG" \
  --veo-duration 4 \
  --veo-model "veo-3.1-fast-generate-preview"
sleep 3

echo ""
echo -e "${GREEN}# Show all generated content${NC}"
sleep 1
run tree datasets/google/ -L 2 -I '*.json' --noreport
sleep 3

#############################################
# Part 6: Video Understanding (25 seconds)
#############################################
clear
echo -e "${GREEN}# Video Understanding - Analyze video content${NC}"
sleep 1
VEO_VIDEO=$(ls -t datasets/google/veo/*/*.mp4 2>/dev/null | head -1)
echo -e "${YELLOW}\$ google-genai --video --input-video \"<veo-video>\" --prompt \"Describe this video\"${NC}"
sleep 1
google-genai --video \
  --input-video "$VEO_VIDEO" \
  --prompt "Describe what happens in this video in detail"
sleep 5

#############################################
# Part 7: Wrap-up (10 seconds)
#############################################
clear
echo ""
echo "================================================"
echo "   Google GenAI API - Complete Suite"
echo "================================================"
echo ""
echo "  GEMINI 2.5:  Text-to-image, Image-to-image"
echo "               Semantic masking (natural language editing)"
echo "  GEMINI 3 PRO: Latest preview model with enhanced quality"
echo "  IMAGEN:  High-quality generation (1-4 images)"
echo "  VEO:     Text-to-video, Image-to-video"
echo "           Native audio, 720p/1080p, 4-8s"
echo "  VIDEO:   Video understanding with timestamps"
echo ""
echo "  github.com/aself101/google-genai-api"
echo ""
echo "================================================"
sleep 5

echo ""
echo -e "${CYAN}Demo complete!${NC}"
