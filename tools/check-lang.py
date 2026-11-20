#!/usr/bin/env python3
# Checks lang/*.txt: every file has exactly the keys of en.txt, the same {placeholders}, no duplicates,
# and every key used by index.html / app.js exists. Exit code 1 on any problem.
import re, sys, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
LINE = re.compile(r'^(\S+) = (.*)$')

def load(path):
    keys, dup = {}, []
    for n, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        m = LINE.match(line)
        if not m:
            sys.exit(f'{path.name}:{n}: not "key = text": {line[:60]}')
        if m.group(1) in keys:
            dup.append(m.group(1))
        keys[m.group(1)] = m.group(2)
    return keys, dup

en, _ = load(root / 'lang' / 'en.txt')
bad = False
for f in sorted((root / 'lang').glob('*.txt')):
    k, dup = load(f)
    missing, extra = sorted(set(en) - set(k)), sorted(set(k) - set(en))
    ph = [key for key in en if key in k and set(re.findall(r'\{\w+\}', en[key])) != set(re.findall(r'\{\w+\}', k[key]))]
    empty = [key for key, v in k.items() if not v.strip()]
    for name, items in (('missing', missing), ('extra', extra), ('duplicate', dup), ('placeholders differ', ph), ('empty', empty)):
        if items:
            bad = True
            print(f'{f.name}: {name}: {", ".join(items)}')
    print(f'{f.name}: {len(k)} keys')

# keys referenced by the page (dynamic ones: engine.*, sync.*, desktop.*, rpc.* are listed in app.js arrays)
src = (root / 'index.html').read_text(encoding='utf-8') + (root / 'app.js').read_text(encoding='utf-8')
used = set(re.findall(r'data-i18n(?:-placeholder|-title)?="([^"]+)"', src))
used |= set(re.findall(r"""\bt\('([a-z_]+\.[\w.-]+)'""", src))
used |= set(re.findall(r"""'(node\.note_\w+|install\.\w+|qr\.\w+)'""", src))
used |= {'engine.' + e for e in ('loading', 'finding', 'unsupported', 'error')}
used |= {'sync.synced', 'sync.scanning'}
used |= {'desktop.' + c for c in re.findall(r"'(\w+)'", re.search(r'DESKTOP_ERRORS = \[([^\]]*)\]', src).group(1))}
used |= {'rpc.' + c for c in re.findall(r"'(-?\d+)'", re.search(r'RPC_ERRORS = \[([^\]]*)\]', src).group(1))}
unknown = sorted(u for u in used if u not in en)
unused = sorted(k for k in en if k not in used)
if unknown:
    bad = True
    print('used but not in en.txt:', ', '.join(unknown))
if unused:
    print('in en.txt but not used (ok if intended):', ', '.join(unused))
sys.exit(1 if bad else 0)
