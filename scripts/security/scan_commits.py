#!/usr/bin/env python3
import os, pathlib, sys, tempfile
from secret_guard import Blocked, run, scan
try:
    before=os.environ.get('BEFORE','')
    if not before or set(before)=={'0'}:
        before=run(['git','merge-base','HEAD','origin/main']).decode().strip()
    commits=run(['git','rev-list',before+'..HEAD']).decode().splitlines()
    if not commits:commits=['HEAD']
    for commit in commits:
        with tempfile.TemporaryDirectory(prefix='commit-check-') as tmp:
            dest=pathlib.Path(tmp)
            names=run(['git','diff-tree','--root','--no-commit-id','--name-only','-r','-z','--diff-filter=ACMR',commit]).decode().split('\0')
            for name in filter(None,names):
                target=dest/name;target.parent.mkdir(parents=True,exist_ok=True)
                target.write_bytes(run(['git','show',commit+':'+name]))
            (dest/'commit-message.txt').write_bytes(run(['git','show','-s','--format=%B',commit]))
            scan(dest)
    print('Introduced commits scanned successfully')
except Exception:
    print('Commit secret check blocked; no matching text disclosed',file=sys.stderr);sys.exit(1)
