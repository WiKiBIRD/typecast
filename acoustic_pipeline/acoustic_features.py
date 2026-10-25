"""
Physical Acoustic Feature Extractor (Module B).
Extracts low-level descriptors (LLDs) using praat-parselmouth:
- Continuous Energy / Intensity profile (dB)
- Fundamental Frequency / Pitch (F0) and voicing detection
- Burg Formants (F1, F2, F3) for vowel centralization/reduction analysis
- Transient burst energy for stop consonant release analysis
"""

import math
from typing import Optional, Tuple, List
import numpy as np
import parselmouth
from parselmouth.praat import call


class AcousticFeatureExtractor:
    """
    Extracts acoustic physical descriptors from audio using Parselmouth (Praat).
    """

    def __init__(self, audio_path: str):
        """
        Initialize the feature extractor with the path to the normalized 16kHz WAV file.
        """
        self.audio_path = audio_path
        self.sound = parselmouth.Sound(audio_path)
        self.duration_sec = self.sound.get_total_duration()
        self.duration_ms = int(round(self.duration_sec * 1000))

        # Extract Parselmouth Core Objects
        # 1. Intensity: time_step=0.005 (5ms) for fine-grained boundary inspection
        self.intensity = self.sound.to_intensity(minimum_pitch=75.0, time_step=0.005)

        # 2. Pitch: 75Hz - 600Hz, time_step=0.005
        self.pitch = self.sound.to_pitch(time_step=0.005, pitch_floor=75.0, pitch_ceiling=600.0)

        # 3. Formants: Burg algorithm, 5 formants up to 5500Hz (standard for adult speech)
        self.formants = self.sound.to_formant_burg(
            time_step=0.005,
            max_number_of_formants=5,
            maximum_formant=5500.0,
            window_length=0.025,
            pre_emphasis_from=50.0
        )

    # --------------------------------------------------------------------------
    # Intensity / Energy Analysis
    # --------------------------------------------------------------------------
    def get_intensity(self, t_sec: float) -> float:
        """Get intensity in dB at time t_sec. Returns 0.0 if undefined or silent."""
        if t_sec < 0 or t_sec > self.duration_sec:
            return 0.0
        try:
            val = self.intensity.get_value(t_sec)
            return float(val) if not math.isnan(val) else 0.0
        except Exception:
            return 0.0

    def get_mean_intensity(self, start_ms: int, end_ms: int) -> float:
        """Calculate mean intensity (dB) within a given millisecond interval."""
        t_start = max(0.0, start_ms / 1000.0)
        t_end = min(self.duration_sec, end_ms / 1000.0)
        if t_end <= t_start:
            return 0.0
        try:
            val = call(self.intensity, "Get mean", t_start, t_end, "energy")
            return float(val) if not math.isnan(val) else 0.0
        except Exception:
            times = np.linspace(t_start, t_end, num=max(2, int((t_end - t_start) / 0.005)))
            vals = [self.get_intensity(t) for t in times]
            return float(np.mean(vals)) if vals else 0.0

    def has_energy_cliff(self, boundary_ms: int, window_ms: int = 30, threshold_db: float = 14.0) -> bool:
        """
        Checks whether there is a drastic energy drop/cliff at the given boundary timestamp.
        Used to distinguish continuous linking from glottal/silent resets.
        """
        t_center = boundary_ms / 1000.0
        t_before = max(0.0, (boundary_ms - window_ms) / 1000.0)
        t_after = min(self.duration_sec, (boundary_ms + window_ms) / 1000.0)

        int_center = self.get_intensity(t_center)
        int_before = self.get_intensity(t_before)
        int_after = self.get_intensity(t_after)

        dip = max(int_before, int_after) - int_center
        return dip >= threshold_db

    # --------------------------------------------------------------------------
    # Pitch / F0 and Voicing Analysis
    # --------------------------------------------------------------------------
    def get_pitch(self, t_sec: float) -> Optional[float]:
        """Get F0 in Hz at time t_sec. Returns None if unvoiced."""
        if t_sec < 0 or t_sec > self.duration_sec:
            return None
        try:
            val = self.pitch.get_value_at_time(t_sec)
            return float(val) if not math.isnan(val) and val > 0 else None
        except Exception:
            return None

    def get_mean_pitch(self, start_ms: int, end_ms: int) -> Optional[float]:
        """Calculate mean pitch (Hz) in the interval for voiced frames."""
        t_start = max(0.0, start_ms / 1000.0)
        t_end = min(self.duration_sec, end_ms / 1000.0)
        if t_end <= t_start:
            return None
        try:
            val = call(self.pitch, "Get mean", t_start, t_end, "Hertz")
            return float(val) if not math.isnan(val) and val > 0 else None
        except Exception:
            return None

    def is_voiced_segment(self, start_ms: int, end_ms: int, min_voiced_ratio: float = 0.3) -> bool:
        """Determines if the segment has sufficient vocal fold vibration (voiced)."""
        t_start = max(0.0, start_ms / 1000.0)
        t_end = min(self.duration_sec, end_ms / 1000.0)
        num_samples = max(3, int((t_end - t_start) / 0.005))
        times = np.linspace(t_start, t_end, num=num_samples)
        voiced_count = sum(1 for t in times if self.get_pitch(t) is not None)
        return (voiced_count / len(times)) >= min_voiced_ratio

    def detect_glottal_creak_or_break(self, start_ms: int, end_ms: int) -> bool:
        """
        Detects abrupt pitch drop, interruption, or irregular creaky voicing
        characteristic of glottal stops (/ʔ/ or glottalized /t/).
        """
        t_start = max(0.0, start_ms / 1000.0)
        t_end = min(self.duration_sec, end_ms / 1000.0)
        times = np.linspace(t_start, t_end, num=max(4, int((t_end - t_start) / 0.005)))
        pitches = [self.get_pitch(t) for t in times]

        # 1. Total pitch drop / interruption inside an otherwise high energy region
        valid_pitches = [p for p in pitches if p is not None]
        mean_intensity = self.get_mean_intensity(start_ms, end_ms)

        # If intensity is moderate-to-high (> 45dB) but pitch suddenly disappears completely or drops < 80Hz
        if mean_intensity > 45.0 and len(valid_pitches) <= len(pitches) * 0.25:
            return True

        # 2. Check for sudden F0 halving / creaky jump (> 50Hz drop within 10ms)
        for i in range(len(valid_pitches) - 1):
            if abs(valid_pitches[i] - valid_pitches[i + 1]) > 55.0:
                return True

        return False

    # --------------------------------------------------------------------------
    # Formants (F1, F2, F3) Analysis (Burg Algorithm)
    # --------------------------------------------------------------------------
    def get_formants(self, t_sec: float) -> Tuple[Optional[float], Optional[float], Optional[float]]:
        """Get (F1, F2, F3) at time t_sec."""
        if t_sec < 0 or t_sec > self.duration_sec:
            return None, None, None
        try:
            f1 = self.formants.get_value_at_time(1, t_sec)
            f2 = self.formants.get_value_at_time(2, t_sec)
            f3 = self.formants.get_value_at_time(3, t_sec)
            return (
                float(f1) if not math.isnan(f1) else None,
                float(f2) if not math.isnan(f2) else None,
                float(f3) if not math.isnan(f3) else None,
            )
        except Exception:
            return None, None, None

    def get_mean_formants(self, start_ms: int, end_ms: int) -> Tuple[Optional[float], Optional[float]]:
        """Calculate mean F1 and F2 within an interval for vowel quality analysis."""
        t_start = max(0.0, start_ms / 1000.0)
        t_end = min(self.duration_sec, end_ms / 1000.0)
        times = np.linspace(t_start, t_end, num=max(3, int((t_end - t_start) / 0.005)))
        f1_list: List[float] = []
        f2_list: List[float] = []
        for t in times:
            f1, f2, _ = self.get_formants(t)
            if f1 and f1 > 150.0:
                f1_list.append(f1)
            if f2 and f2 > 500.0:
                f2_list.append(f2)
        mean_f1 = float(np.mean(f1_list)) if f1_list else None
        mean_f2 = float(np.mean(f2_list)) if f2_list else None
        return mean_f1, mean_f2

    def is_centralized_schwa(self, start_ms: int, end_ms: int) -> bool:
        """
        Check if formants converge to standard neutral Schwa vowel space
        (F1 target ~ 500 Hz [380-680 Hz], F2 target ~ 1500 Hz [1200-1800 Hz]).
        """
        f1, f2 = self.get_mean_formants(start_ms, end_ms)
        if f1 is None or f2 is None:
            return False
        return (380.0 <= f1 <= 700.0) and (1200.0 <= f2 <= 1800.0)

    # --------------------------------------------------------------------------
    # Plosive Transient Burst Detection
    # --------------------------------------------------------------------------
    def has_burst_spike(self, start_ms: int, end_ms: int) -> bool:
        """
        Checks for a transient burst spike (characteristic of plosive release).
        If absent, indicates unreleased stop (ELISION).
        """
        t_start = max(0.0, start_ms / 1000.0)
        t_end = min(self.duration_sec, end_ms / 1000.0)
        times = np.linspace(t_start, t_end, num=max(4, int((t_end - t_start) / 0.003)))
        intensities = [self.get_intensity(t) for t in times]
        if len(intensities) < 2:
            return False

        # Look for a sharp rise (> 8 dB within 5-10ms)
        diffs = np.diff(intensities)
        max_rise = np.max(diffs) if len(diffs) > 0 else 0.0
        return max_rise >= 8.0
