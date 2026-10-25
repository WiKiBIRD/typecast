"""
Audio Preprocessing and Forced Alignment Driver (Module A).
- Normalizes input audio to Mono, 16kHz, 16-bit PCM WAV.
- Cleans and normalizes transcript text for aligner consumption.
- Executes Montreal Forced Aligner (MFA) subprocess if available.
- Parses Praat .TextGrid into structured Word and Phoneme models (ms precision).
- Provides robust acoustic VAD + phonetic dictionary fallback and OOV detection.
"""

import math
import os
import re
import shutil
import subprocess
import tempfile
from typing import List, Tuple, Dict, Optional
import soundfile as sf
import librosa
import numpy as np
import parselmouth
from parselmouth.praat import call

from .schema import WordModel, PhonemeModel


# --------------------------------------------------------------------------
# Built-in CMUDict subset for common conversational English & fallback G2P
# --------------------------------------------------------------------------
BUILTIN_CMU_DICT: Dict[str, List[str]] = {
    "hold": ["HH", "OW1", "L", "D"],
    "on": ["AA1", "N"],
    "and": ["AE1", "N", "D"],
    "sit": ["S", "IH1", "T"],
    "down": ["D", "AW1", "N"],
    "did": ["D", "IH1", "D"],
    "you": ["Y", "UW1"],
    "to": ["T", "UW1"],
    "the": ["DH", "AH0"],
    "a": ["AH0"],
    "an": ["AE1", "N"],
    "in": ["IH1", "N"],
    "it": ["IH1", "T"],
    "is": ["IH1", "Z"],
    "that": ["DH", "AE1", "T"],
    "this": ["DH", "IH1", "S"],
    "for": ["F", "AO1", "R"],
    "with": ["W", "IH1", "DH"],
    "as": ["AE1", "Z"],
    "at": ["AE1", "T"],
    "be": ["B", "IY1"],
    "have": ["HH", "AE1", "V"],
    "not": ["N", "AA1", "T"],
    "what": ["W", "AH1", "T"],
    "all": ["AO1", "L"],
    "were": ["W", "ER1"],
    "we": ["W", "IY1"],
    "when": ["W", "EH1", "N"],
    "your": ["Y", "AO1", "R"],
    "can": ["K", "AE1", "N"],
    "said": ["S", "EH1", "D"],
    "there": ["DH", "EH1", "R"],
    "use": ["Y", "UW1", "Z"],
    "how": ["HH", "AW1"],
    "each": ["IY1", "CH"],
    "she": ["SH", "IY1"],
    "which": ["W", "IH1", "CH"],
    "do": ["D", "UW1"],
    "their": ["DH", "EH1", "R"],
    "time": ["T", "AY1", "M"],
    "if": ["IH1", "F"],
    "will": ["W", "IH1", "L"],
    "way": ["W", "EY1"],
    "about": ["AH0", "B", "AW1", "T"],
    "many": ["M", "EH1", "N", "IY0"],
    "then": ["DH", "EH1", "N"],
    "them": ["DH", "EH1", "M"],
    "write": ["R", "AY1", "T"],
    "would": ["W", "UH1", "D"],
    "like": ["L", "AY1", "K"],
    "so": ["S", "OW1"],
    "these": ["DH", "IY1", "Z"],
    "her": ["HH", "ER1"],
    "long": ["L", "AO1", "NG"],
    "make": ["M", "EY1", "K"],
    "thing": ["TH", "IH1", "NG"],
    "see": ["S", "IY1"],
    "him": ["HH", "IH1", "M"],
    "two": ["T", "UW1"],
    "has": ["HH", "AE1", "Z"],
    "look": ["L", "UH1", "K"],
    "more": ["M", "AO1", "R"],
    "day": ["D", "EY1"],
    "could": ["K", "UH1", "D"],
    "go": ["G", "OW1"],
    "come": ["K", "AH1", "M"],
    "take": ["T", "EY1", "K"],
    "get": ["G", "EH1", "T"],
    "place": ["P", "L", "EY1", "S"],
    "made": ["M", "EY1", "D"],
    "live": ["L", "IH1", "V"],
    "where": ["W", "EH1", "R"],
    "after": ["AE1", "F", "T", "ER0"],
    "back": ["B", "AE1", "K"],
    "little": ["L", "IH1", "T", "AH0", "L"],
    "only": ["OW1", "N", "L", "IY0"],
    "round": ["R", "AW1", "N", "D"],
    "man": ["M", "AE1", "N"],
    "year": ["Y", "IH1", "R"],
    "came": ["K", "EY1", "M"],
    "show": ["SH", "OW1"],
    "every": ["EH1", "V", "R", "IY0"],
    "good": ["G", "UH1", "D"],
    "me": ["M", "IY1"],
    "give": ["G", "IH1", "V"],
    "our": ["AW1", "ER0"],
    "under": ["AH1", "N", "D", "ER0"],
    "name": ["N", "EY1", "M"],
    "very": ["V", "EH1", "R", "IY0"],
    "through": ["TH", "R", "UW1"],
    "just": ["JH", "AH1", "S", "T"],
    "form": ["F", "AO1", "R", "M"],
    "sentence": ["S", "EH1", "N", "T", "AH0", "N", "S"],
    "great": ["G", "R", "EY1", "T"],
    "think": ["TH", "IH1", "NG", "K"],
    "say": ["S", "EY1"],
    "help": ["HH", "EH1", "L", "P"],
    "low": ["L", "OW1"],
    "line": ["L", "AY1", "N"],
    "differ": ["D", "IH1", "F", "ER0"],
    "turn": ["T", "ER1", "N"],
    "cause": ["K", "AO1", "Z"],
    "much": ["M", "AH1", "CH"],
    "mean": ["M", "IY1", "N"],
    "before": ["B", "IH0", "F", "AO1", "R"],
    "move": ["M", "UW1", "V"],
    "right": ["R", "AY1", "T"],
    "boy": ["B", "OY1"],
    "old": ["OW1", "L", "D"],
    "too": ["T", "UW1"],
    "same": ["S", "EY1", "M"],
    "tell": ["T", "EH1", "L"],
    "does": ["D", "AH1", "Z"],
    "set": ["S", "EH1", "T"],
    "three": ["TH", "R", "IY1"],
    "want": ["W", "AA1", "N", "T"],
    "air": ["EH1", "R"],
    "well": ["W", "EH1", "L"],
    "also": ["AO1", "L", "S", "OW0"],
    "play": ["P", "L", "EY1"],
    "small": ["S", "M", "AO1", "L"],
    "end": ["EH1", "N", "D"],
    "put": ["P", "UH1", "T"],
    "home": ["HH", "OW1", "M"],
    "read": ["R", "IY1", "D"],
    "hand": ["HH", "AE1", "N", "D"],
    "port": ["P", "AO1", "R", "T"],
    "large": ["L", "AA1", "R", "JH"],
    "spell": ["S", "P", "EH1", "L"],
    "add": ["AE1", "D"],
    "even": ["IY1", "V", "AH0", "N"],
    "land": ["L", "AE1", "N", "D"],
    "here": ["HH", "IH1", "R"],
    "must": ["M", "AH1", "S", "T"],
    "big": ["B", "IH1", "G"],
    "high": ["HH", "AY1"],
    "such": ["S", "AH1", "CH"],
    "follow": ["F", "AA1", "L", "OW0"],
    "act": ["AE1", "K", "T"],
    "why": ["W", "AY1"],
    "ask": ["AE1", "S", "K"],
    "men": ["M", "EH1", "N"],
    "change": ["CH", "EY1", "N", "JH"],
    "went": ["W", "EH1", "N", "T"],
    "light": ["L", "AY1", "T"],
    "kind": ["K", "AY1", "N", "D"],
    "off": ["AO1", "F"],
    "need": ["N", "IY1", "D"],
    "house": ["HH", "AW1", "S"],
    "picture": ["P", "IH1", "K", "CH", "ER0"],
    "try": ["T", "R", "AY1"],
    "us": ["AH1", "S"],
    "again": ["AH0", "G", "EH1", "N"],
    "animal": ["AE1", "N", "AH0", "M", "AH0", "L"],
    "point": ["P", "OY1", "N", "T"],
    "mother": ["M", "AH1", "DH", "ER0"],
    "world": ["W", "ER1", "L", "D"],
    "near": ["N", "IH1", "R"],
    "build": ["B", "IH1", "L", "D"],
    "self": ["S", "EH1", "L", "F"],
    "earth": ["ER1", "TH"],
    "father": ["F", "AA1", "DH", "ER0"],
}


def rule_based_g2p(word: str) -> List[str]:
    """
    Algorithmic G2P fallback for out-of-vocabulary (OOV) English words.
    Maps orthography to approximate Arpabet phone sequence.
    """
    w = word.lower()
    phones: List[str] = []
    i = 0
    while i < len(w):
        ch = w[i]
        nxt = w[i + 1] if i + 1 < len(w) else ""

        # Digraphs
        if ch == "t" and nxt == "h":
            phones.append("TH")
            i += 2
        elif ch == "s" and nxt == "h":
            phones.append("SH")
            i += 2
        elif ch == "c" and nxt == "h":
            phones.append("CH")
            i += 2
        elif ch == "p" and nxt == "h":
            phones.append("F")
            i += 2
        elif ch == "n" and nxt == "g":
            phones.append("NG")
            i += 2
        elif ch == "e" and nxt == "e":
            phones.append("IY1")
            i += 2
        elif ch == "o" and nxt == "o":
            phones.append("UW1")
            i += 2
        elif ch == "a" and nxt == "i":
            phones.append("EY1")
            i += 2
        elif ch == "a" and nxt == "y":
            phones.append("EY1")
            i += 2
        elif ch == "o" and nxt == "u":
            phones.append("AW1")
            i += 2
        elif ch == "o" and nxt == "w":
            phones.append("OW1")
            i += 2
        elif ch == "o" and nxt == "i":
            phones.append("OY1")
            i += 2
        # Single letters
        elif ch == "a":
            phones.append("AE1")
            i += 1
        elif ch == "e":
            phones.append("EH1")
            i += 1
        elif ch == "i":
            phones.append("IH1")
            i += 1
        elif ch == "o":
            phones.append("AA1")
            i += 1
        elif ch == "u":
            phones.append("AH1")
            i += 1
        elif ch == "b":
            phones.append("B")
            i += 1
        elif ch == "c":
            phones.append("K")
            i += 1
        elif ch == "d":
            phones.append("D")
            i += 1
        elif ch == "f":
            phones.append("F")
            i += 1
        elif ch == "g":
            phones.append("G")
            i += 1
        elif ch == "h":
            phones.append("HH")
            i += 1
        elif ch == "j":
            phones.append("JH")
            i += 1
        elif ch == "k":
            phones.append("K")
            i += 1
        elif ch == "l":
            phones.append("L")
            i += 1
        elif ch == "m":
            phones.append("M")
            i += 1
        elif ch == "n":
            phones.append("N")
            i += 1
        elif ch == "p":
            phones.append("P")
            i += 1
        elif ch == "r":
            phones.append("R")
            i += 1
        elif ch == "s":
            phones.append("S")
            i += 1
        elif ch == "t":
            phones.append("T")
            i += 1
        elif ch == "v":
            phones.append("V")
            i += 1
        elif ch == "w":
            phones.append("W")
            i += 1
        elif ch == "y":
            phones.append("Y")
            i += 1
        elif ch == "z":
            phones.append("Z")
            i += 1
        else:
            i += 1
    return phones if phones else ["AH0"]


def get_word_phonemes(word: str) -> Tuple[List[str], bool]:
    """
    Returns (phonemes, is_oov).
    """
    clean_w = word.lower().strip()
    if clean_w in BUILTIN_CMU_DICT:
        return BUILTIN_CMU_DICT[clean_w], False
    return rule_based_g2p(clean_w), True


def extract_stress_from_phone(phone: str) -> Tuple[str, int]:
    """
    Extracts base phoneme and stress (0, 1, 2) from an Arpabet symbol.
    e.g., 'OW1' -> ('OW', 1), 'HH' -> ('HH', 0), 'AH0' -> ('AH', 0).
    """
    if phone and phone[-1].isdigit():
        return phone, int(phone[-1])
    return phone, 0


# --------------------------------------------------------------------------
# Audio Normalization (Mono, 16kHz, 16-bit PCM WAV)
# --------------------------------------------------------------------------
def normalize_audio(input_path: str, output_wav_path: str) -> Tuple[str, int]:
    """
    Standardize raw audio to Mono, 16000 Hz, 16-bit PCM WAV.
    Returns (output_wav_path, duration_ms).
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input audio file not found: {input_path}")

    y, sr = librosa.load(input_path, sr=16000, mono=True)
    # Ensure float in range [-1.0, 1.0]
    max_val = np.max(np.abs(y))
    if max_val > 0.99:
        y = y / max_val * 0.95

    sf.write(output_wav_path, y, 16000, subtype="PCM_16")
    duration_ms = int(round((len(y) / 16000.0) * 1000))
    return output_wav_path, duration_ms


# --------------------------------------------------------------------------
# Text Cleaning
# --------------------------------------------------------------------------
def clean_transcript(text: str) -> str:
    """
    Cleans transcript text: removes punctuation, standardizes whitespaces.
    Example: "Hold on, and sit down!" -> "hold on and sit down"
    """
    # Replace em-dash / en-dash / hyphens with space
    t = re.sub(r"[\-\—\–]", " ", text)
    # Remove all non-alphanumeric except whitespace and apostrophe
    t = re.sub(r"[^\w\s\']", " ", t)
    # Remove freestanding apostrophes
    t = re.sub(r"\s\'|\'\s", " ", t)
    # Normalize whitespaces
    t = re.sub(r"\s+", " ", t).strip()
    return t.lower()


# --------------------------------------------------------------------------
# TextGrid Parser (Reads Praat TextGrid file)
# --------------------------------------------------------------------------
def parse_textgrid(tg_path: str) -> List[WordModel]:
    """
    Parses a Praat .TextGrid file into structured WordModel list.
    Extracts words and phones tiers with millisecond accuracy.
    """
    if not os.path.exists(tg_path):
        raise FileNotFoundError(f"TextGrid file not found: {tg_path}")

    tg = call("Read from file...", tg_path)
    num_tiers = call(tg, "Get number of tiers")

    words_tier_idx = None
    phones_tier_idx = None

    for i in range(1, num_tiers + 1):
        tier_name = call(tg, "Get tier name", i).lower()
        if "word" in tier_name:
            words_tier_idx = i
        elif "phone" in tier_name:
            phones_tier_idx = i

    if not words_tier_idx:
        # Default first interval tier as words
        words_tier_idx = 1
    if not phones_tier_idx and num_tiers >= 2:
        phones_tier_idx = 2

    # Extract all phones
    raw_phones: List[Tuple[str, int, int]] = []
    if phones_tier_idx:
        num_intervals = call(tg, "Get number of intervals", phones_tier_idx)
        for j in range(1, num_intervals + 1):
            label = call(tg, "Get label of interval", phones_tier_idx, j).strip()
            if not label or label in ["", "sil", "sp", "spn", "{sil}", "<eps>"]:
                continue
            xmin = call(tg, "Get start time of interval", phones_tier_idx, j)
            xmax = call(tg, "Get end time of interval", phones_tier_idx, j)
            raw_phones.append((label.upper(), int(round(xmin * 1000)), int(round(xmax * 1000))))

    # Extract all words
    words: List[WordModel] = []
    num_words = call(tg, "Get number of intervals", words_tier_idx)
    for j in range(1, num_words + 1):
        label = call(tg, "Get label of interval", words_tier_idx, j).strip()
        if not label or label in ["", "sil", "sp", "spn", "<eps>", "<sil>"]:
            continue
        w_xmin = call(tg, "Get start time of interval", words_tier_idx, j)
        w_xmax = call(tg, "Get end time of interval", words_tier_idx, j)
        w_start_ms = int(round(w_xmin * 1000))
        w_end_ms = int(round(w_xmax * 1000))

        # Assign corresponding phones overlapping with this word
        word_phones: List[PhonemeModel] = []
        for p_label, p_start, p_end in raw_phones:
            # Overlap check with tolerance
            if p_start >= w_start_ms - 15 and p_end <= w_end_ms + 15:
                _, stress = extract_stress_from_phone(p_label)
                word_phones.append(
                    PhonemeModel(
                        phoneme=p_label,
                        start_ms=p_start,
                        end_ms=p_end,
                        is_weakened=False,
                        stress=stress
                    )
                )

        # Fallback if no phones assigned to this word in TextGrid
        if not word_phones:
            symbols, _ = get_word_phonemes(label)
            seg_len = max(1, (w_end_ms - w_start_ms) // len(symbols))
            for idx, sym in enumerate(symbols):
                p_s = w_start_ms + idx * seg_len
                p_e = w_end_ms if idx == len(symbols) - 1 else p_s + seg_len
                _, stress = extract_stress_from_phone(sym)
                word_phones.append(
                    PhonemeModel(
                        phoneme=sym,
                        start_ms=p_s,
                        end_ms=p_e,
                        is_weakened=False,
                        stress=stress
                    )
                )

        words.append(
            WordModel(
                word=label.lower(),
                start_ms=w_start_ms,
                end_ms=w_end_ms,
                phonemes=word_phones,
                phenomena=[]
            )
        )

    return words


# --------------------------------------------------------------------------
# Fallback Acoustic Aligner (VAD + CMU Dictionary / Intrinsic Duration)
# --------------------------------------------------------------------------
def fallback_acoustic_align(wav_path: str, transcript: str) -> List[WordModel]:
    """
    Acoustic fallback aligner when MFA is unavailable or encounters OOV.
    Uses Parselmouth intensity-based Voice Activity Detection (VAD)
    combined with CMUDict to align words and phones to physical speech energy.
    """
    clean_text = clean_transcript(transcript)
    word_tokens = clean_text.split()
    if not word_tokens:
        return []

    sound = parselmouth.Sound(wav_path)
    total_duration_sec = sound.get_total_duration()
    total_duration_ms = int(round(total_duration_sec * 1000))

    # Detect active speech segments using Parselmouth Intensity
    intensity = sound.to_intensity(time_step=0.01)
    times = intensity.xs()
    values = [intensity.get_value(t) for t in times]
    # Filter valid values
    valid_vals = [v for v in values if not math.isnan(v)]
    if not valid_vals:
        mean_int = 50.0
    else:
        mean_int = float(np.mean(valid_vals))

    # Threshold for speech presence: 10 dB below mean
    speech_threshold = max(35.0, mean_int - 12.0)
    is_active = [bool(not math.isnan(v) and v >= speech_threshold) for v in values]

    # Find speech onset and offset
    active_indices = [idx for idx, act in enumerate(is_active) if act]
    if active_indices:
        speech_start_ms = max(50, int(round(times[active_indices[0]] * 1000)))
        speech_end_ms = min(total_duration_ms - 50, int(round(times[active_indices[-1]] * 1000)))
    else:
        speech_start_ms = 100
        speech_end_ms = max(200, total_duration_ms - 100)

    if speech_end_ms <= speech_start_ms:
        speech_end_ms = total_duration_ms

    # Distribute active duration among words based on phoneme count weight
    word_phoneme_map: List[Tuple[str, List[str]]] = []
    oov_words: List[str] = []
    total_phones = 0

    for w in word_tokens:
        phones, is_oov = get_word_phonemes(w)
        if is_oov:
            oov_words.append(w)
        word_phoneme_map.append((w, phones))
        total_phones += len(phones)

    if oov_words:
        print(f"[Aligner Notice] OOV (Out-of-Vocabulary) words detected: {oov_words}. Applied G2P fallback.")

    total_speech_time = max(len(word_tokens) * 120, speech_end_ms - speech_start_ms)
    time_per_phone = total_speech_time / max(1, total_phones)

    current_ms = speech_start_ms
    aligned_words: List[WordModel] = []

    for w, phones in word_phoneme_map:
        w_start = current_ms
        phone_models: List[PhonemeModel] = []

        for p in phones:
            p_len = int(round(time_per_phone))
            p_end = current_ms + p_len
            _, stress = extract_stress_from_phone(p)
            phone_models.append(
                PhonemeModel(
                    phoneme=p,
                    start_ms=current_ms,
                    end_ms=p_end,
                    is_weakened=False,
                    stress=stress
                )
            )
            current_ms = p_end

        w_end = current_ms
        # Add slight natural inter-word interval (10ms)
        current_ms += 10

        aligned_words.append(
            WordModel(
                word=w,
                start_ms=w_start,
                end_ms=w_end,
                phonemes=phone_models,
                phenomena=[]
            )
        )

    return aligned_words


# --------------------------------------------------------------------------
# Main Aligner Function
# --------------------------------------------------------------------------
def align_audio_and_transcript(
    audio_path: str,
    transcript: str,
    mfa_dictionary: str = "english_us_arpa",
    mfa_acoustic_model: str = "english_us_arpa",
    force_fallback: bool = False
) -> Tuple[str, List[WordModel], int]:
    """
    End-to-end alignment coordinator.
    Returns: (normalized_wav_path, list_of_words, duration_ms)
    """
    # 1. Normalize audio
    temp_dir = tempfile.mkdtemp(prefix="acoustic_align_")
    norm_wav_path = os.path.join(temp_dir, "audio.wav")
    _, duration_ms = normalize_audio(audio_path, norm_wav_path)

    # 2. Clean transcript
    cleaned_text = clean_transcript(transcript)
    if not cleaned_text:
        raise ValueError("Transcript text cannot be empty.")

    lab_path = os.path.join(temp_dir, "audio.lab")
    with open(lab_path, "w", encoding="utf-8") as f:
        f.write(cleaned_text + "\n")

    # 3. Check MFA availability
    mfa_bin = shutil.which("mfa")
    words: List[WordModel] = []

    if mfa_bin and not force_fallback:
        mfa_out_dir = os.path.join(temp_dir, "mfa_out")
        os.makedirs(mfa_out_dir, exist_ok=True)
        cmd = [
            mfa_bin,
            "align",
            temp_dir,
            mfa_dictionary,
            mfa_acoustic_model,
            mfa_out_dir,
            "--clean",
            "--overwrite",
            "--output_format",
            "textgrid"
        ]
        try:
            print(f"[Aligner] Running MFA align: {' '.join(cmd)}")
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            tg_candidate = os.path.join(mfa_out_dir, "audio.TextGrid")
            if res.returncode == 0 and os.path.exists(tg_candidate):
                print("[Aligner] MFA alignment succeeded.")
                words = parse_textgrid(tg_candidate)
            else:
                print(f"[Aligner Warning] MFA exit code {res.returncode}. Output: {res.stderr[:300]}")
                print("[Aligner Warning] Falling back to acoustic VAD aligner.")
                words = fallback_acoustic_align(norm_wav_path, cleaned_text)
        except Exception as e:
            print(f"[Aligner Warning] MFA alignment raised exception: {e}")
            print("[Aligner Warning] Falling back to acoustic VAD aligner.")
            words = fallback_acoustic_align(norm_wav_path, cleaned_text)
    else:
        if not mfa_bin:
            print("[Aligner Notice] 'mfa' not detected in system PATH. Using acoustic VAD fallback.")
        words = fallback_acoustic_align(norm_wav_path, cleaned_text)

    return norm_wav_path, words, duration_ms
