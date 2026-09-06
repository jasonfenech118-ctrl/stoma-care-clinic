"""Map the register book's free-text stoma type onto the app's dropdown.

The book has 105 distinct spellings of what are really a dozen things —
"Ileostomy", "ileosotmy", "ilestomy", "illeostomy", "Ilesosotomy" are all one
stoma. Rather than a hand-written alias list that will miss the next typo,
each word is matched against the small set of real words by closeness, which
catches the misspellings that exist and the ones that have not happened yet.

Two things are pulled out of the same string:
  the stoma itself  - the base (colostomy / ileostomy / urostomy ...) and its
                      qualifier (end, loop, transverse, sigmoid, ...)
  a mucus fistula   - "Ileostomy + Mucus fistula" is two outputs formed at one
                      operation, which the registry already models as a second
                      stoma, so it is returned separately rather than mangled
                      into the type.
"""
import difflib
import re

BASES = {
    'colostomy': 'Colostomy', 'colestomy': 'Colostomy',
    'ileostomy': 'Ileostomy', 'urostomy': 'Urostomy',
    'caecostomy': 'Caecostomy', 'cecostomy': 'Caecostomy',
    'jejunostomy': 'Jejunostomy',
    'ureterostomy': 'Urostomy',      # a ureterostomy is recorded as a urostomy
    'cystectomy': None,              # an operation, not a stoma type
}
QUALIFIERS = [
    (r'\bdouble\s*[- ]?\s*barr?ell?\b|\bdouble\b', 'Double-Barrel'),
    (r'\btransvers\w*\b', 'Transverse'),
    (r'\bdescend\w*|\bdecend\w*', 'Descending'),
    (r'\bsigmoid\b', 'Sigmoid'),
    (r'\bloop\b', 'Loop'),
    (r'\bcovering\b', 'Loop'),       # a covering stoma is a loop
    (r'\bend\b', 'End'),
]
# The dropdown the app should offer, in the order a nurse thinks of them.
CANONICAL = [
    'End - Colostomy', 'Loop - Colostomy', 'Transverse Colostomy',
    'Sigmoid Colostomy', 'Descending Colostomy', 'Double-Barrel Colostomy',
    'Colostomy', 'End - Ileostomy', 'Loop - Ileostomy',
    'Double-Barrel Ileostomy', 'Ileostomy', 'Urostomy', 'Caecostomy',
    'Jejunostomy', 'Mucus Fistula', 'Other',
]


def _words(text):
    return re.findall(r"[a-z]+", str(text or '').lower())


def _base_of(word):
    """The real stoma word this one is a spelling of, or None."""
    if word in BASES:
        return BASES[word]
    # Long words only: short ones produce silly matches.
    if len(word) < 6:
        return None
    hit = difflib.get_close_matches(word, list(BASES), n=1, cutoff=0.78)
    return BASES[hit[0]] if hit else None


def has_mucus_fistula(text):
    t = ' '.join(_words(text))
    if re.search(r'\bm\.?f\b', str(text or '').lower()):
        return True
    if 'fistula' not in t and not difflib.get_close_matches('fistula', _words(text), n=1, cutoff=0.8):
        return False
    return bool(re.search(r'muc|mous|mouc', t))


def map_type(text):
    """(canonical type, mucus_fistula, confidence, note).

    Confidence is 'exact' when a real stoma word was read, 'fuzzy' when it was
    reached through a misspelling, and 'unmapped' when the text names no stoma
    at all — those keep their original words and land in the report for a
    nurse to place by hand.
    """
    raw = str(text or '').strip()
    if not raw:
        return None, False, 'blank', 'no stoma type given'
    mf = has_mucus_fistula(raw)
    words = _words(raw)
    bases, fuzzy = [], False
    for w in words:
        b = _base_of(w)
        if b and b not in bases:
            bases.append(b)
            if w not in BASES:
                fuzzy = True
    if not bases:
        # A mucus fistula on its own is a stoma in its own right.
        if mf:
            return 'Mucus Fistula', False, 'exact', ''
        return 'Other', False, 'unmapped', f'no stoma word found in {raw!r}'
    if len(bases) > 1:
        # "Colostomy/ Ileostomy" — two stomas at one operation, which needs a
        # person to say which is which, so it is reported rather than guessed.
        return 'Other', mf, 'ambiguous', f'names more than one stoma: {" + ".join(bases)}'
    base = bases[0]
    qual = None
    for pat, name in QUALIFIERS:
        if re.search(pat, ' '.join(words)):
            qual = name
            break
    if base in ('Urostomy', 'Caecostomy', 'Jejunostomy'):
        out = base                                   # these take no qualifier
    elif qual in ('End', 'Loop'):
        out = f'{qual} - {base}'
    elif qual:
        out = f'{qual} {base}'
    else:
        out = base                                   # unqualified is a real answer
    if out not in CANONICAL:
        return 'Other', mf, 'unmapped', f'{out!r} is not in the dropdown'
    return out, mf, ('fuzzy' if fuzzy else 'exact'), ''
