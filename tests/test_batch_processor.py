"""
Unit tests for Production Batch Pipeline & Checkpoint Worker.
"""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

# Add repository root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from batch_processor import (
    ProgressTracker,
    find_audio_file,
    process_episode_task,
)


class TestBatchProcessor(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="batch_test_")

    def tearDown(self):
        import shutil
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)

    def test_find_audio_file_strict_number(self):
        """Verifies regex matching for episode audio avoids #1 matching #10, #11, etc."""
        audio_dir = Path(self.test_dir) / "audio"
        audio_dir.mkdir()

        # Create dummy audio files
        (audio_dir / "Slow English Podcast #1 Restaurant.mp3").touch()
        (audio_dir / "Slow English Podcast #10 Beach.mp3").touch()
        (audio_dir / "Slow English Podcast #100 Country.mp3").touch()

        # Ep 1 must match #1, not #10 or #100
        found_ep1 = find_audio_file(1, audio_dir)
        self.assertIsNotNone(found_ep1)
        self.assertTrue(found_ep1.endswith("Slow English Podcast #1 Restaurant.mp3"))

        # Ep 10 must match #10
        found_ep10 = find_audio_file(10, audio_dir)
        self.assertIsNotNone(found_ep10)
        self.assertTrue(found_ep10.endswith("Slow English Podcast #10 Beach.mp3"))

        # Ep 2 doesn't exist
        found_ep2 = find_audio_file(2, audio_dir)
        self.assertIsNone(found_ep2)

    def test_progress_tracker_checkpoint(self):
        """Verifies progress file serialization, resume status, and summary statistics."""
        prog_file = Path(self.test_dir) / "test_progress.json"
        tracker = ProgressTracker(prog_file)

        # Initially empty
        self.assertEqual(tracker.data["completed"], 0)
        self.assertEqual(tracker.data["failed"], 0)

        # Mark EP 1 as completed
        fake_out = Path(self.test_dir) / "ep-001.acoustic.json"
        fake_out.touch()

        tracker.mark_completed(
            ep_id="slow-english-ep-001",
            ep_num=1,
            sentence_count=83,
            phenomena_counts={"REDUCTION": 50, "LINKING": 30},
            output_file=str(fake_out),
            duration_sec=3.12,
        )

        self.assertEqual(tracker.data["completed"], 1)
        self.assertTrue(tracker.is_completed("slow-english-ep-001", fake_out))

        # Check reload from disk
        tracker2 = ProgressTracker(prog_file)
        self.assertEqual(tracker2.data["completed"], 1)
        self.assertTrue(tracker2.is_completed("slow-english-ep-001", fake_out))

        # Mark EP 2 as failed
        tracker2.mark_failed("slow-english-ep-002", 2, "Test failure error")
        self.assertEqual(tracker2.data["failed"], 1)


if __name__ == "__main__":
    unittest.main()
