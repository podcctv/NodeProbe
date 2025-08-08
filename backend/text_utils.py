"""Utilities for safer Unicode text handling.

Provides helpers to sanitize text by removing combining marks and normalizing
characters, compute visual width in terminal environments and pad strings to a
desired display width.  These helpers mitigate issues with ambiguous or
full-width characters when rendering aligned text.
"""

from __future__ import annotations

import re
import unicodedata
from wcwidth import wcwidth


def sanitize_text(s: str) -> str:
    """Return ``s`` normalized and without combining marks.

    The function first applies NFKC normalization which converts full-width
    variants to their ASCII equivalents and composes decomposed characters.  It
    then removes any remaining combining marks (category ``Mn``) so that the
    resulting string contains only standalone printable characters.
    """

    # Normalize to NFKC form to collapse compatible characters
    s = unicodedata.normalize("NFKC", s)
    # Remove all combining marks
    return "".join(ch for ch in s if unicodedata.category(ch) != "Mn")


RISKY = re.compile(
    r"[\u0300-\u036F]"  # combining marks
    r"|\u3000"            # full-width space
    r"|[\uFF00-\uFF65]"  # full-width ASCII variants
)


def sanitize_banner(s: str) -> str:
    """Remove characters that tend to disrupt monospace ASCII art."""

    s = unicodedata.normalize("NFKC", s)
    return RISKY.sub("", s)


def visual_width(s: str) -> int:
    """Return the display width of ``s`` in columns.

    Characters with undefined width are treated as width 1 for robustness.
    """

    s = sanitize_text(s)
    total = 0
    for ch in s:
        w = wcwidth(ch)
        total += 1 if w < 0 else w
    return total


def pad_to(s: str, width: int) -> str:
    """Pad ``s`` on the right with spaces so its visual width equals ``width``."""

    s = sanitize_text(s)
    pad = width - visual_width(s)
    return s + " " * max(pad, 0)


def find_suspects(s: str):
    """Return a list of suspicious characters in ``s`` for debugging.

    Each element in the returned list is a tuple ``(index, character,
    codepoint, category, east_asian_width)``.  Characters are considered
    suspicious if they are combining marks, full-width, wide or ambiguous
    according to ``unicodedata.east_asian_width`` or if their codepoint is
    non-ASCII.
    """

    suspects = []
    for i, ch in enumerate(s):
        cat = unicodedata.category(ch)
        eaw = unicodedata.east_asian_width(ch)
        if cat == "Mn" or eaw in {"F", "W", "A"} or ord(ch) > 127:
            suspects.append((i, ch, f"U+{ord(ch):04X}", cat, eaw))
    return suspects

