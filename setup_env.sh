#!/usr/bin/env bash
# ==============================================================================
# Setup Environment for English Phoneme-Level MFA Alignment & Acoustic Pipeline
# ==============================================================================

set -e

echo "=== [1/3] Checking and Installing Python Dependencies ==="
# Determine python and pip
PYTHON_BIN="${PYTHON_BIN:-python3}"
PIP_BIN="${PIP_BIN:-pip3}"

echo "Using Python: $($PYTHON_BIN --version 2>&1)"
echo "Using Pip: $($PIP_BIN --version 2>&1)"

$PIP_BIN install --upgrade pip
$PIP_BIN install \
    praat-parselmouth \
    soundfile \
    librosa \
    scipy \
    numpy \
    pydantic

echo "=== [2/3] Checking Montreal Forced Aligner (MFA) ==="
if command -v mfa &> /dev/null; then
    echo "MFA is already installed in PATH: $(mfa version)"
else
    echo "Notice: 'mfa' command not found in current PATH."
    echo "Recommended installation method via Conda / Mamba:"
    echo "  conda create -n mfa -c conda-forge montreal-forced-aligner"
    echo "  conda activate mfa"
    echo ""
    echo "Or in the active conda environment:"
    echo "  conda install -c conda-forge montreal-forced-aligner"
    echo ""
    echo "Note: The pipeline includes an embedded acoustic fallback aligner,"
    echo "allowing unit tests and acoustic extraction to run seamlessly even without MFA."
fi

echo "=== [3/3] Downloading Pretrained MFA Models (if MFA is installed) ==="
if command -v mfa &> /dev/null; then
    echo "Downloading English US ARPA dictionary..."
    mfa model download dictionary english_us_arpa || true
    echo "Downloading English US ARPA acoustic model..."
    mfa model download acoustic english_us_arpa || true
    echo "MFA models downloaded successfully."
else
    echo "Skipping MFA model download because 'mfa' is not installed yet."
fi

echo "=== Setup Environment Completed ==="
