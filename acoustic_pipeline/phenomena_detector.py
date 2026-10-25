"""
Acoustic Phenomena Detector (Module C).
Detects 5 major connected speech acoustic phenomena:
1. REDUCTION (弱读): Vowel duration < 55ms or reduced to Schwa /AH0/, /IH0/, or centralized formants.
2. LINKING (辅音连读): Consonant-vowel juncture, silence gap < 25ms, no acoustic energy cliff.
3. ELISION (失爆/不完全爆破): Plosive (/P/, /T/, /K/, /B/, /D/, /G/) followed by a consonant without release burst.
4. ASSIMILATION (同化): Alveolar consonant (/T/, /D/, /S/, /Z/, /N/) before palatal glide /Y/ with place migration.
5. GLOTTAL_STOP (喉塞音): /T/ phoneme accompanied by F0 interruption, irregular creak, or unreleased glottal closure.
"""

from typing import List, Set
from .schema import WordModel, PhonemeModel
from .acoustic_features import AcousticFeatureExtractor


# Arpabet phonetic category definitions
ARPABET_VOWELS: Set[str] = {
    "AA", "AA0", "AA1", "AA2",
    "AE", "AE0", "AE1", "AE2",
    "AH", "AH0", "AH1", "AH2",
    "AO", "AO0", "AO1", "AO2",
    "AW", "AW0", "AW1", "AW2",
    "AY", "AY0", "AY1", "AY2",
    "EH", "EH0", "EH1", "EH2",
    "ER", "ER0", "ER1", "ER2",
    "EY", "EY0", "EY1", "EY2",
    "IH", "IH0", "IH1", "IH2",
    "IY", "IY0", "IY1", "IY2",
    "OW", "OW0", "OW1", "OW2",
    "OY", "OY0", "OY1", "OY2",
    "UH", "UH0", "UH1", "UH2",
    "UW", "UW0", "UW1", "UW2",
}

STOPS: Set[str] = {"P", "T", "K", "B", "D", "G"}
ALVEOLARS: Set[str] = {"T", "D", "S", "Z", "N"}
PALATAL_GLIDES: Set[str] = {"Y", "JH", "CH", "SH", "ZH"}


def base_phone(p: str) -> str:
    """Strip trailing stress digits from phoneme symbol."""
    return p.rstrip("012").upper()


def is_vowel(p: str) -> bool:
    return p.upper() in ARPABET_VOWELS or base_phone(p) in {
        "AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW"
    }


def is_consonant(p: str) -> bool:
    return not is_vowel(p)


class PhenomenaDetector:
    """
    Evaluates acoustic characteristics and phonological contexts to detect
    speech phenomena across words and phonemes.
    """

    def __init__(self, extractor: AcousticFeatureExtractor):
        self.extractor = extractor

    def detect_all(self, words: List[WordModel]) -> List[WordModel]:
        """
        Runs the complete detection suite over the list of aligned words.
        Modifies word.phenomena and phoneme.is_weakened in-place.
        """
        if not words:
            return words

        # 1. Phoneme-level & Word-internal detections: REDUCTION, GLOTTAL_STOP
        for w_idx, word in enumerate(words):
            self._detect_reduction(word)
            self._detect_glottal_stop(word)
            self._detect_internal_elision(word)

        # 2. Cross-word boundary detections: LINKING, ELISION, ASSIMILATION
        for i in range(len(words) - 1):
            curr_w = words[i]
            next_w = words[i + 1]
            self._detect_boundary_phenomena(curr_w, next_w)

        return words

    # --------------------------------------------------------------------------
    # 1. REDUCTION (弱读)
    # --------------------------------------------------------------------------
    def _detect_reduction(self, word: WordModel) -> None:
        """
        Marks REDUCTION if any vowel phoneme duration < 55ms, or is /AH0/ / /IH0/,
        or exhibits formant centralization towards neutral Schwa.
        """
        has_reduction = False
        for p in word.phonemes:
            if is_vowel(p.phoneme):
                duration_ms = p.end_ms - p.start_ms
                bp = base_phone(p.phoneme)
                is_schwa_symbol = (p.phoneme in ["AH0", "IH0", "ER0"])

                # Formant centralization test
                centralized = self.extractor.is_centralized_schwa(p.start_ms, p.end_ms)

                if duration_ms < 55 or is_schwa_symbol or (centralized and p.stress == 0):
                    p.is_weakened = True
                    has_reduction = True

        if has_reduction and "REDUCTION" not in word.phenomena:
            word.phenomena.append("REDUCTION")

    # --------------------------------------------------------------------------
    # 2. GLOTTAL_STOP (喉塞音)
    # --------------------------------------------------------------------------
    def _detect_glottal_stop(self, word: WordModel) -> None:
        """
        Marks GLOTTAL_STOP if a /T/ phoneme exhibits pitch interruption,
        creaky voice, or closure without dental release burst.
        """
        for p in word.phonemes:
            bp = base_phone(p.phoneme)
            if bp == "T":
                # Check for creak or pitch discontinuity
                is_creaky = self.extractor.detect_glottal_creak_or_break(p.start_ms, p.end_ms)
                has_burst = self.extractor.has_burst_spike(p.start_ms, p.end_ms)

                # Coda /T/ without burst or with creaky voicing
                if is_creaky or not has_burst:
                    if "GLOTTAL_STOP" not in word.phenomena:
                        word.phenomena.append("GLOTTAL_STOP")
                    break

    # --------------------------------------------------------------------------
    # 3. ELISION (失爆 / 不完全爆破) - Word internal
    # --------------------------------------------------------------------------
    def _detect_internal_elision(self, word: WordModel) -> None:
        """
        Checks word-internal stop clusters (stop + consonant) lacking release burst.
        """
        for i in range(len(word.phonemes) - 1):
            p1 = word.phonemes[i]
            p2 = word.phonemes[i + 1]
            if base_phone(p1.phoneme) in STOPS and is_consonant(p2.phoneme):
                burst = self.extractor.has_burst_spike(p1.start_ms, p1.end_ms)
                if not burst:
                    if "ELISION" not in word.phenomena:
                        word.phenomena.append("ELISION")
                    break

    # --------------------------------------------------------------------------
    # Cross-word Boundary Phenomena: LINKING, ELISION, ASSIMILATION
    # --------------------------------------------------------------------------
    def _detect_boundary_phenomena(self, w1: WordModel, w2: WordModel) -> None:
        """
        Examines acoustic properties and phonetic context across two adjacent words.
        """
        if not w1.phonemes or not w2.phonemes:
            return

        last_p = w1.phonemes[-1]
        first_p = w2.phonemes[0]
        gap_ms = w2.start_ms - w1.end_ms

        last_bp = base_phone(last_p.phoneme)
        first_bp = base_phone(first_p.phoneme)

        # ----------------------------------------------------------------------
        # LINKING: Consonant + Vowel, gap < 25ms, energy unbroken
        # ----------------------------------------------------------------------
        if is_consonant(last_p.phoneme) and is_vowel(first_p.phoneme):
            if gap_ms < 25:
                has_cliff = self.extractor.has_energy_cliff(w1.end_ms, window_ms=25, threshold_db=15.0)
                if not has_cliff:
                    if "LINKING" not in w1.phenomena:
                        w1.phenomena.append("LINKING")

        # ----------------------------------------------------------------------
        # ELISION across boundary: Stop + Consonant, lack of burst
        # e.g. "sit down" (/t/ followed by /d/)
        # ----------------------------------------------------------------------
        if last_bp in STOPS and is_consonant(first_p.phoneme):
            has_burst = self.extractor.has_burst_spike(last_p.start_ms, last_p.end_ms)
            if not has_burst or gap_ms < 25:
                if "ELISION" not in w1.phenomena:
                    w1.phenomena.append("ELISION")

        # ----------------------------------------------------------------------
        # ASSIMILATION: Alveolar + Palatal Glide /y/ (e.g. did you, don't you)
        # ----------------------------------------------------------------------
        if last_bp in ALVEOLARS and first_bp in PALATAL_GLIDES:
            if gap_ms < 25:
                if "ASSIMILATION" not in w1.phenomena:
                    w1.phenomena.append("ASSIMILATION")
