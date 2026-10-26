"""
Acoustic Physical Energy Snapper & Voice Activity Calibration Engine.
Finds physical speech onset/offset transitions in audio gaps using Short-Time Energy (STE),
intensity gradients, and zero-crossing phase alignment to eliminate clipping and ASR lag.
"""

from typing import Tuple, Optional
import numpy as np
import parselmouth


class AcousticEnergySnapper:
    def __init__(self, sound: parselmouth.Sound):
        self.sound = sound
        self.sr = sound.sampling_frequency
        self.samples = sound.values[0]  # channel 1
        self.duration = sound.duration
        self._intensity = None

    @property
    def intensity(self):
        if self._intensity is None:
            self._intensity = self.sound.to_intensity(time_step=0.01)
        return self._intensity

    def snap_to_zero_crossing(self, target_t: float, search_window_sec: float = 0.015) -> float:
        """
        Snaps a timestamp to the closest waveform zero-crossing point
        within a small search window (default +/- 15ms) to guarantee pop-free cuts.
        """
        target_sample = int(target_t * self.sr)
        target_sample = max(0, min(len(self.samples) - 2, target_sample))
        window_samples = int(search_window_sec * self.sr)

        start_idx = max(0, target_sample - window_samples)
        end_idx = min(len(self.samples) - 1, target_sample + window_samples)

        sub = self.samples[start_idx:end_idx]
        if len(sub) < 2:
            return target_t

        zero_crossings = np.where(np.diff(np.sign(sub)))[0]
        if len(zero_crossings) == 0:
            return target_t

        rel_target = target_sample - start_idx
        best_crossing = zero_crossings[np.argmin(np.abs(zero_crossings - rel_target))]
        return (start_idx + best_crossing) / self.sr

    def calibrate_sentence_onset(
        self,
        current_start: float,
        prev_end: Optional[float] = None,
        max_lookback_sec: float = 0.80,
        energy_threshold_db: float = 54.0,
    ) -> float:
        """
        Searches backwards from current_start (which Whisper often places on the stressed vowel)
        into the gap after prev_end to find the real physical onset of initial unstressed syllables.
        """
        # Determine safe search boundary
        earliest_allowed = (prev_end + 0.030) if (prev_end is not None and prev_end > 0) else max(0.0, current_start - max_lookback_sec)
        if earliest_allowed >= current_start:
            return self.snap_to_zero_crossing(current_start)

        search_start = max(earliest_allowed, current_start - max_lookback_sec)
        search_end = current_start + 0.05

        # Query intensity frames in range
        times = self.intensity.xs()
        valid_indices = [
            i for i, t in enumerate(times) if search_start <= t <= search_end
        ]
        if not valid_indices:
            return self.snap_to_zero_crossing(current_start)

        t_slice = [times[i] for i in valid_indices]
        v_slice = [self.intensity.get_value(t) for t in t_slice]

        # Scan backwards from current_start:
        # Find where energy rises above floor or drops into noise floor
        # Baseline noise floor is minimum energy in gap
        clean_values = [v for v in v_slice if not np.isnan(v)]
        if not clean_values:
            return self.snap_to_zero_crossing(current_start)

        noise_floor = min(clean_values)
        active_threshold = max(energy_threshold_db, noise_floor + 8.0)

        # Look from search_end backwards towards search_start:
        # If we detect that before current_start there is sustained energy (> active_threshold)
        # preceded by a valley, we snap to that valley!
        detected_onset = current_start

        # Find the earliest frame that exceeds active_threshold after a quiet floor
        for i in range(len(t_slice) - 1, -1, -1):
            t = t_slice[i]
            val = v_slice[i]
            if np.isnan(val):
                continue

            if val >= active_threshold:
                # Still voice/speech energy
                detected_onset = t
            elif val <= (noise_floor + 3.0) and detected_onset < current_start:
                # We reached the quiet gap before speech onset!
                detected_onset = t
                break

        # Snap detected onset to exact zero crossing
        return self.snap_to_zero_crossing(detected_onset)

    def calibrate_sentence_offset(
        self,
        current_end: float,
        next_start: Optional[float] = None,
        max_lookahead_sec: float = 0.25,
        tail_min_gap_sec: float = 0.025,
    ) -> float:
        """
        Calibrates sentence tail offset to capture natural unvoiced release / aspiration
        without encroaching on the next sentence's onset.
        """
        latest_allowed = (next_start - tail_min_gap_sec) if (next_start is not None and next_start > current_end) else (current_end + max_lookahead_sec)
        target = min(latest_allowed, current_end + 0.08)
        return self.snap_to_zero_crossing(target)
