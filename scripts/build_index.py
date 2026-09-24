#!/usr/bin/env python3
"""Build the search index (JSON) from a folder of DCS plain-text files.

Usage: python build_index.py SOURCE_DIR OUTPUT_JSON [--link-base URL]

Each line of the DCS files looks like:  text of the line // (12.3)
The trailing (12.3) is kept as the reference. Lines without one are
still indexed, with the file line number as their only reference.
"""
import argparse, json, re, unicodedata
from pathlib import Path

REF = re.compile(r'\s*\(([0-9]+(?:\.[0-9]+)*)\)\s*$')


def fold(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if not unicodedata.combining(c)).lower()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('source')
    ap.add_argument('output')
    ap.add_argument('--link-base',
                    default='https://github.com/cltk/sanskrit_text_dcs/blob/master/corpora/')
    a = ap.parse_args()

    files = sorted(Path(a.source).glob('*.txt'), key=lambda p: fold(p.stem))
    texts, lines = [], []
    for t, path in enumerate(files):
        texts.append({'name': unicodedata.normalize('NFC', path.stem),
                      'file': path.name})
        raw = path.read_text(encoding='utf-8', errors='replace')
        for n, line in enumerate(raw.splitlines(), start=1):
            line = unicodedata.normalize('NFC', line).strip()
            if not line:
                continue
            m = REF.search(line)
            ref = m.group(1) if m else ''
            text = line[:m.start()] if m else line
            lines.append([t, n, ref, text.strip()])

    out = {'meta': {'linkBase': a.link_base,
                    'source': 'Digital Corpus of Sanskrit (via cltk/sanskrit_text_dcs)'},
           'texts': texts, 'lines': lines}
    Path(a.output).parent.mkdir(parents=True, exist_ok=True)
    Path(a.output).write_text(json.dumps(out, ensure_ascii=False,
                              separators=(',', ':')), encoding='utf-8')
    print(f'{len(texts)} texts, {len(lines)} lines -> {a.output}')


if __name__ == '__main__':
    main()
