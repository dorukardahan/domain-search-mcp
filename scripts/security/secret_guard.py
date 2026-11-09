#!/usr/bin/env python3
"""Fail closed, never print matching text or credentials. Standard library only."""
import argparse, hashlib, json, os, pathlib, re, shutil, subprocess, sys, tempfile
HERE = pathlib.Path(__file__).resolve().parent
class Blocked(Exception): pass

def run(argv, cwd=None, data=None):
    p = subprocess.run(argv, cwd=cwd, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if p.returncode: raise Blocked('Command failed; output suppressed: '+pathlib.Path(argv[0]).name)
    return p.stdout

def scanner():
    binary = os.environ.get('GITLEAKS_BIN') or shutil.which('gitleaks')
    local = pathlib.Path.home()/'.local/bin/gitleaks'
    if not binary and local.is_file(): binary=str(local)
    if not binary: raise Blocked('Gitleaks unavailable; refusing to proceed')
    if run([binary,'version']).decode().strip() != '8.30.1': raise Blocked('Unreviewed Gitleaks version')
    return binary

def scan(folder):
    folder=pathlib.Path(folder)
    if not folder.is_dir(): raise Blocked('Scan target missing')
    for p in folder.rglob('*'):
        if p.is_symlink(): raise Blocked('Symlink in scan target')
    with tempfile.TemporaryDirectory(prefix='secret-report-') as tmp:
        report=pathlib.Path(tmp)/'redacted.json'
        p=subprocess.run([scanner(),'dir',str(folder),'--config',str(HERE/'gitleaks.toml'),
            '--redact=100','--no-banner','--no-color','--ignore-gitleaks-allow','--max-target-megabytes','0',
            '--gitleaks-ignore-path',str(pathlib.Path(tmp)/'no-repo-suppressions'),
            '--report-format','json','--report-path',str(report),'--exit-code','23'],
            stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        if p.returncode not in (0,23): raise Blocked('Secret scan failed; not a clean result')
        findings=json.loads(report.read_text()) if report.exists() else []
        if findings or p.returncode:
            # Never expose Secret, Match, line content, raw command output or absolute paths.
            safe=[]
            for f in findings:
                name=str(f.get('File','unknown'))
                try:name=str(pathlib.Path(name).relative_to(folder))
                except ValueError: name=pathlib.Path(name).name
                safe.append({'file':name,'rule':f.get('RuleID','unknown'),'line':f.get('StartLine')})
            print(json.dumps({'status':'blocked','findings':safe},ensure_ascii=True))
            raise Blocked('Potential credential found; stop, notify owner, do not test or rotate it')

def snapshot_index(dest):
    paths=run(['git','diff','--cached','--name-only','--diff-filter=ACMR','-z']).decode().split('\0')
    for name in filter(None,paths):
        if pathlib.PurePosixPath(name).is_absolute() or '..' in pathlib.PurePosixPath(name).parts: raise Blocked('Invalid staged path')
        entry=run(['git','ls-files','--stage','--',name]).decode()
        if entry.startswith('120000') or entry.startswith('160000'): raise Blocked('Staged symlink/submodule needs review')
        target=dest/name; target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(run(['git','show',':'+name]))

def checked_write(path, data):
    path=pathlib.Path(path)
    if path.is_symlink() or any(p.is_symlink() for p in path.parents): raise Blocked('Symlink write target')
    with tempfile.TemporaryDirectory(prefix='prewrite-') as tmp:
        candidate=pathlib.Path(tmp)/path.name; candidate.write_bytes(data); scan(tmp)
    path.parent.mkdir(parents=True,exist_ok=True)
    # Preserve permissions on existing memory files; do not change ownership or isolation.
    if path.exists(): path.write_bytes(data)
    else: path.write_bytes(data)

def main():
    p=argparse.ArgumentParser();p.add_argument('mode',choices=['scan','staged','message','write']);p.add_argument('path',nargs='?');a=p.parse_args()
    if a.mode=='scan': scan(a.path)
    elif a.mode=='write': checked_write(a.path,sys.stdin.buffer.read())
    else:
        with tempfile.TemporaryDirectory(prefix='commit-scan-') as tmp:
            dest=pathlib.Path(tmp)
            if a.mode=='staged': snapshot_index(dest)
            else:(dest/'commit-message.txt').write_bytes(pathlib.Path(a.path).read_bytes())
            scan(dest)
    print('Secret guard: passed')
if __name__=='__main__':
    try:main()
    except Exception as e:
        print(str(e) if isinstance(e,Blocked) else 'Secret guard failed; details suppressed',file=sys.stderr);sys.exit(1)
