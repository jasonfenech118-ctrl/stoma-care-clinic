"""Shared normalisation for the register-book imports.

Everything here is deliberately conservative: where a value cannot be read
with confidence the row keeps the raw text and is flagged, rather than being
guessed at. A wrong guess in a patient register is worse than a gap somebody
is asked to fill in.
"""
import re
import datetime

# ---------------------------------------------------------------------------
# ID cards
# ---------------------------------------------------------------------------
# Maltese cards are digits plus a checking letter (M, G, A, L, P, H, B, Z, C,
# and F/L on the older foreign-resident series). The book writes them with
# stray spaces, occasional leading zeros, and the letter in either case.
ID_RE = re.compile(r'^\s*(\d{3,8})\s*([A-Za-z])\s*$')


def norm_id(value):
    """The card as it should be stored: no spaces, uppercase letter."""
    if value is None:
        return None
    m = ID_RE.match(str(value))
    if not m:
        return None
    return f'{m.group(1)}{m.group(2).upper()}'


def id_key(value):
    """A looser key for matching: leading zeros dropped.

    '0970249M' and '970249M' are one patient written twice, and the registry's
    own duplicate check already treats a leading zero that way.
    """
    n = norm_id(value)
    if not n:
        return None
    return f'{n[:-1].lstrip("0") or "0"}{n[-1]}'


# ---------------------------------------------------------------------------
# Dates
# ---------------------------------------------------------------------------
MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
          'july', 'august', 'september', 'october', 'november', 'december']
# The book writes the month wrong often enough to be worth spelling out.
MONTH_ALIASES = {'janauary': 1, 'janaury': 1, 'jaunary': 1, 'febuary': 2,
                 'septmber': 9, 'sepember': 9, 'ocotber': 10, 'decmber': 12}

# 03/01/2014, 6/2/2015, 20/3/15, 25.04.15 — day first, as Malta writes it.
DATE_IN_TEXT = re.compile(r'(?<!\d)(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{2,4})(?!\d)')


def month_number(text):
    """The month a band names, or None. Handles the book's misspellings.

    Bands are written every way the book felt like that year: "January",
    "APRIL", "January of the Year 2014", "Janauary of the year 2014". Each
    word is tried on its own so the surrounding prose does not matter.
    """
    if text is None:
        return None
    for word in re.findall(r'[A-Za-z]+', str(text).lower()):
        if word in MONTH_ALIASES:
            return MONTH_ALIASES[word]
        for i, m in enumerate(MONTHS, 1):
            # An abbreviation counts only from three letters — "may" is a
            # month, but "ma" could be anything.
            if word == m or (len(word) >= 3 and m.startswith(word)):
                return i
    return None


def year_in_text(text):
    """A four-digit year written into a band, e.g. "March of the Year 2014"."""
    if text is None:
        return None
    m = re.search(r'(?<!\d)(19[5-9]\d|20[0-4]\d)(?!\d)', str(text))
    return int(m.group(1)) if m else None


def date_from_text(text, band_year=None):
    """Pull an explicit operation/reversal date out of a comment.

    The book often writes the real date in the notes even when the column is
    blank — "Reversal of Ileostomy 20/3/15". That beats the month band, so it
    is looked for first. Two-digit years are read against the band year where
    there is one, so '15' in a 2015 section is 2015 and not 2115.
    """
    if not text:
        return None
    m = DATE_IN_TEXT.search(str(text))
    if not m:
        return None
    day, mon, yr = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if yr < 100:
        yr += 2000 if yr < 70 else 1900
    if not (1 <= mon <= 12 and 1 <= day <= 31):
        return None
    # A date far from the section it sits in is more likely a misread than a
    # real outlier, so it is refused and the band is used instead.
    if band_year and abs(yr - band_year) > 1:
        return None
    try:
        return datetime.date(yr, mon, day)
    except ValueError:
        return None


def as_date(value):
    """A real date from a cell, or None. Excel hands these back as datetimes."""
    if isinstance(value, datetime.datetime):
        return value.date()
    if isinstance(value, datetime.date):
        return value
    return None


# ---------------------------------------------------------------------------
# Text
# ---------------------------------------------------------------------------
def clean(value):
    """Collapse whitespace; empty becomes None so blanks are unambiguous."""
    if value is None:
        return None
    s = re.sub(r'\s+', ' ', str(value)).strip()
    return s or None


def clean_phone(value):
    """Phone numbers arrive as ints, floats, and slash-separated lists."""
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    s = re.sub(r'\s+', '', str(value))
    # "British Tourist" and the like sit in this column; keep them as a note.
    return s or None
