"""
Pydantic Data Schemas for English Phoneme-Level Acoustic Pipeline.
Conforms strictly to the project specification for Phase 1 output.
"""

from typing import List
from pydantic import BaseModel, Field


class PhonemeModel(BaseModel):
    """Phoneme-level alignment and acoustic property model."""
    phoneme: str = Field(..., description="Arpabet phoneme symbol, e.g. HH, OW1, AH0")
    start_ms: int = Field(..., description="Start timestamp in milliseconds")
    end_ms: int = Field(..., description="End timestamp in milliseconds")
    is_weakened: bool = Field(default=False, description="Whether this phoneme is acoustically weakened/reduced")
    stress: int = Field(default=0, description="Lexical stress: 0=none, 1=primary, 2=secondary")


class WordModel(BaseModel):
    """Word-level alignment and acoustic phenomena model."""
    word: str = Field(..., description="Orthographic word text, e.g. hold")
    start_ms: int = Field(..., description="Start timestamp in milliseconds")
    end_ms: int = Field(..., description="End timestamp in milliseconds")
    phonemes: List[PhonemeModel] = Field(default_factory=list, description="Phonemes composing the word")
    phenomena: List[str] = Field(
        default_factory=list,
        description="Detected acoustic phenomena: REDUCTION, LINKING, ELISION, ASSIMILATION, GLOTTAL_STOP"
    )


class ChunkModel(BaseModel):
    """Prosodic chunk (thought group) model based on cognitive load & acoustic boundaries."""
    chunk_id: str = Field(..., description="Unique chunk identifier, e.g. chunk_001")
    start_ms: int = Field(..., description="Start timestamp in milliseconds")
    end_ms: int = Field(..., description="End timestamp in milliseconds")
    text: str = Field(..., description="Normalized transcript text of the chunk")
    words: List[WordModel] = Field(default_factory=list, description="Words contained in this prosodic chunk")


class AudioPipelineOutput(BaseModel):
    """Top-level pipeline output schema."""
    audio_id: str = Field(..., description="Audio identifier")
    duration_ms: int = Field(..., description="Total audio duration in milliseconds")
    chunks: List[ChunkModel] = Field(default_factory=list, description="Prosodic chunks of the audio")
