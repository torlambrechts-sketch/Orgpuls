"""Two captures of the Supabase advisors (the JSON get_advisors returns, saved to a file) as a diff of their findings.

  python3 scripts/audit/advisors-diff.py before.json after.json

Each finding becomes one line, lint|level|schema.name|detail, so a migration's effect on the advisors reads as the
lines it added (+) and removed (-).
"""
import json
import sys


def load(path):
    data = json.loads(open(path, encoding='utf-8').read())
    if isinstance(data, dict) and isinstance(data.get('result'), str):
        data = json.loads(data['result'])
    lints = data['result']['lints'] if 'result' in data else data['lints']
    out = set()
    for lint in lints:
        for f in lint.get('findings') or [{'detail': lint.get('detail', ''), 'metadata': lint.get('metadata', {})}]:
            m = f.get('metadata') or {}
            out.add(f"{lint['name']}|{lint['level']}|{m.get('schema', '')}.{m.get('name', '')}|{f.get('detail', '')[:160]}")
    return out


before, after = load(sys.argv[1]), load(sys.argv[2])
print(f'before {len(before)}, after {len(after)}')
for line in sorted(after - before):
    print('+', line)
for line in sorted(before - after):
    print('-', line)
