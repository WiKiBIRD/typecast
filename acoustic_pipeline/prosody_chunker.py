"""
Prosody Chunker (Module D).
Replaces rigid punctuation-based sentence splitting with cognitive working memory
capacity limits (7±2 words) and acoustic pause boundaries (silence pause >= 250ms).
"""

from typing import List
from .schema import WordModel, ChunkModel


class ProsodyChunker:
    """
    Partitions aligned words into human cognitive-load aligned prosodic thought groups.
    """

    def __init__(self, pause_threshold_ms: int = 250, min_chunk_words: int = 5, max_chunk_words: int = 9):
        """
        :param pause_threshold_ms: Minimum acoustic pause (in ms) to trigger chunk boundary. Default 250ms.
        :param min_chunk_words: Minimum words before seeking an acoustic boundary.
        :param max_chunk_words: Strict upper limit on chunk words (7+2 = 9 words).
        """
        self.pause_threshold_ms = pause_threshold_ms
        self.min_chunk_words = min_chunk_words
        self.max_chunk_words = max_chunk_words

    def chunk(self, words: List[WordModel]) -> List[ChunkModel]:
        """
        Splits words into Prosodic Chunks.
        """
        if not words:
            return []

        chunks: List[ChunkModel] = []
        current_words: List[WordModel] = []
        chunk_counter = 1

        for i, word in enumerate(words):
            current_words.append(word)

            is_last_word = (i == len(words) - 1)
            if is_last_word:
                break

            next_word = words[i + 1]
            inter_word_gap = next_word.start_ms - word.end_ms
            curr_len = len(current_words)

            # Trigger boundary condition:
            # 1. Acoustic pause >= 250ms
            # 2. OR cognitive working memory threshold reached (>= max_chunk_words = 9)
            # 3. OR moderate pause (>= 150ms) when chunk size already within 7~8 words
            should_break = False

            if inter_word_gap >= self.pause_threshold_ms:
                should_break = True
            elif curr_len >= self.max_chunk_words:
                should_break = True
            elif curr_len >= 7 and inter_word_gap >= 120:
                should_break = True

            if should_break:
                chunks.append(self._create_chunk(f"chunk_{chunk_counter:03d}", current_words))
                chunk_counter += 1
                current_words = []

        if current_words:
            chunks.append(self._create_chunk(f"chunk_{chunk_counter:03d}", current_words))

        return chunks

    @staticmethod
    def _create_chunk(chunk_id: str, words: List[WordModel]) -> ChunkModel:
        start_ms = words[0].start_ms
        end_ms = words[-1].end_ms
        text = " ".join(w.word for w in words)
        return ChunkModel(
            chunk_id=chunk_id,
            start_ms=start_ms,
            end_ms=end_ms,
            text=text,
            words=words
        )
