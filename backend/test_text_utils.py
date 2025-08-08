from backend.text_utils import (
    sanitize_text,
    visual_width,
    pad_to,
    find_suspects,
    sanitize_banner,
)


def test_sanitize_text_removes_combining_marks():
    original = "e\u0308"  # 'e' + combining diaeresis
    assert sanitize_text(original) == "ë"


def test_pad_to_counts_visual_width():
    original = "e\u0308"
    padded = pad_to(original, 2)
    assert visual_width(padded) == 2
    assert padded.endswith(" ")


def test_find_suspects_identifies_combining_mark():
    original = "e\u0308"
    suspects = find_suspects(original)
    codes = [item[2] for item in suspects]
    assert "U+0308" in codes


def test_sanitize_banner_removes_risky_chars():
    original = "e\u0308\u3000\uFF01"
    assert sanitize_banner(original) == "ë !"
