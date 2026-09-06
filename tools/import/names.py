"""Work out which half of a name blob is the surname.

New_Patients and the Reversals book write the patient as one string, and the
order changes partway through: the early years read "Zammit Carmel" (surname
first), the later ones "Domenica Belizzi" (given name first). There is no
marker for which, so the split cannot be done by position.

What makes it tractable is that two of the four sources — the live registry
and the Deceased book — keep the two halves in separate columns. Together they
give a few thousand known Maltese surnames and given names, and that
dictionary decides the order for the blobs. Where the evidence is weak or
contradictory the row is still split, on the book's dominant surname-first
convention, but it is flagged so a nurse confirms it rather than it passing
silently into the registry.
"""
import re
from collections import Counter


def _tokens(name):
    return [t for t in re.split(r'\s+', re.sub(r'[^\w\s\'-]', ' ', name or '')) if t]


def build_dictionary(registry, deceased):
    """Counters of how often each word is used as a surname / a given name."""
    surnames, givens = Counter(), Counter()
    for src in (registry, deceased):
        for r in src:
            for t in _tokens(r.get('surname')):
                surnames[t.lower()] += 1
            for t in _tokens(r.get('first_name')):
                givens[t.lower()] += 1
    return surnames, givens


def split_name(blob, surnames, givens):
    """Split a name blob into (first_name, surname, confidence, note).

    Every place the blob could be cut is scored on how well each side matches
    the dictionary, and the best split wins. Confidence is 'high' when the
    dictionary is clear, 'low' when it is guessing.
    """
    toks = _tokens(blob)
    if not toks:
        return None, None, 'none', 'no name'
    if len(toks) == 1:
        return None, toks[0], 'low', 'single word — taken as the surname'

    def score(sur_toks, giv_toks):
        s = 0
        for t in sur_toks:
            t = t.lower()
            s += 2 if surnames[t] else 0
            s -= 1 if givens[t] and not surnames[t] else 0
        for t in giv_toks:
            t = t.lower()
            s += 2 if givens[t] else 0
            s -= 1 if surnames[t] and not givens[t] else 0
        return s

    # Ties are broken toward the shorter surname: Maltese surnames are usually
    # one word, so an unrecognised middle token ("Anthony Terrence Zammit")
    # belongs with the given names rather than with the surname.
    best = None
    for cut in range(1, len(toks)):
        for first, surname, sur_toks, giv_toks, order in (
                (' '.join(toks[cut:]), ' '.join(toks[:cut]), toks[:cut], toks[cut:], 'surname-first'),
                (' '.join(toks[:cut]), ' '.join(toks[cut:]), toks[cut:], toks[:cut], 'given-first')):
            cand = (first, surname, score(sur_toks, giv_toks), order, -len(sur_toks))
            if best is None or (cand[2], cand[4]) > (best[2], best[4]):
                best = cand

    first, surname, sc, order = best[0], best[1], best[2], best[3]
    # A clear win needs both halves recognised; anything less is a guess.
    if sc >= 4:
        conf = 'high'
    elif sc >= 2:
        conf = 'medium'
    else:
        conf = 'low'
        # Nothing recognised: fall back to the book's dominant convention.
        first, surname, order = ' '.join(toks[1:]), toks[0], 'surname-first (assumed)'
    return first or None, surname or None, conf, order
