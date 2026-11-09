#!/usr/bin/env python3
"""One release entry: clean checkout -> exact manifest -> scan -> checked artifact.
Manual uploads are CI-only and require the protected owner-approved environment.
"""
import argparse, hashlib, json, os, pathlib, shutil, sys, tarfile, tempfile
from secret_guard import Blocked, run, scan
HERE=pathlib.Path(__file__).resolve().parent
ROOT=HERE.parent.parent

def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def files(folder): return sorted(str(p.relative_to(folder)) for p in folder.rglob('*') if p.is_file())
def validate_names(names, allowed):
    if len(names)!=len(set(names)) or set(names)!=set(allowed): raise Blocked('Package manifest differs from exact allowlist; owner review required')
    for name in names:
        p=pathlib.PurePosixPath(name)
        if p.is_absolute() or '..' in p.parts or any(x in ('memory','reports','.git') for x in p.parts): raise Blocked('Unsafe package path')

def extract(tarball, target):
    with tarfile.open(tarball,'r:gz') as tar:
        names=[]
        for m in tar.getmembers():
            p=pathlib.PurePosixPath(m.name)
            if p.is_absolute() or '..' in p.parts or not p.parts or p.parts[0]!='package': raise Blocked('Unsafe tar member')
            if m.isdir(): continue
            if not m.isfile() or len(p.parts)<2: raise Blocked('Link or special file in package')
            name=str(pathlib.PurePosixPath(*p.parts[1:])); names.append(name)
            dest=target/name;dest.parent.mkdir(parents=True,exist_ok=True)
            dest.write_bytes(tar.extractfile(m).read())
        if len(names)!=len(set(names)): raise Blocked('Duplicate package member')
    return sorted(names)

def verify_npm_artifact(out, manifest, policy, package_name):
    artifact=out/manifest['artifact']
    if artifact.parent!=out or digest(artifact)!=manifest['sha256']:raise Blocked('Artifact changed after review')
    with tempfile.TemporaryDirectory(prefix='verify-package-') as tmp:
        dest=pathlib.Path(tmp)
        validate_names(extract(artifact,dest),policy['files']);scan(dest)
        meta=json.loads((dest/'package.json').read_text())
        if meta['name']!=package_name or meta['version']!=manifest['version']:raise Blocked('Package metadata mismatch')
    return artifact

def ci_authorized(policy):
    if os.environ.get('GITHUB_ACTIONS')!='true' or os.environ.get('GITHUB_REPOSITORY')!=policy['repository']:
        raise Blocked('Uploads only through the configured CI; local mode is prepare-only')
    if policy['automatic']:
        if os.environ.get('GITHUB_REF')!='refs/heads/main': raise Blocked('Automatic publish requires main')
    elif os.environ.get('RELEASE_APPROVED_ENVIRONMENT')!='owner-approved-release':
        raise Blocked('Manual publish requires protected environment owner approval')

def main():
    p=argparse.ArgumentParser();p.add_argument('mode',choices=['prepare','publish']);p.add_argument('--package',required=True);p.add_argument('--output',required=True);p.add_argument('--clawhub-root');a=p.parse_args()
    policies=json.loads((HERE/'release-policy.json').read_text()); policy=policies[a.package]
    out=pathlib.Path(a.output).resolve()
    if out==ROOT or ROOT in out.parents: raise Blocked('Artifact must be outside source checkout')
    if a.mode=='prepare':
        if run(['git','status','--porcelain','--untracked-files=all'],ROOT).strip(): raise Blocked('Source checkout not clean')
        commit=run(['git','rev-parse','HEAD'],ROOT).decode().strip()
        remote=run(['git','remote','get-url','origin'],ROOT).decode().strip()
        https_origins = [f'https://github.com/{policy["repository"]}.git', f'https://github.com/{policy["repository"]}']
        ssh_user, separator, ssh_host_path = remote.partition('@')
        valid_ssh = separator and ssh_user == 'git' and ssh_host_path == f'github.com:{policy["repository"]}.git'
        if remote not in https_origins and not valid_ssh: raise Blocked('Unexpected origin')
        if out.exists() and any(out.iterdir()): raise Blocked('Artifact directory must be empty')
        out.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='release-checkout-') as tmp:
            src=pathlib.Path(tmp)/'source'
            run(['git','clone','--quiet','--no-hardlinks',str(ROOT),str(src)])
            run(['git','checkout','--quiet','--detach',commit],src)
            for entry in run(['git','ls-files','--stage'],src).decode().splitlines():
                if entry.startswith(('120000','160000')): raise Blocked('Tracked link/submodule rejected')
            pkg=src/policy['path']
            if policy['registry']=='npm':
                run(['npm','ci','--include=dev','--ignore-scripts'],src)
                if policy.get('prepublish'):run(['npm','run','prepublishOnly'],pkg)
                meta=json.loads((pkg/'package.json').read_text())
                dry=json.loads(run(['npm','pack','--dry-run','--json','--ignore-scripts'],pkg))[0]
                names=sorted(f['path'] for f in dry['files']);validate_names(names,policy['files'])
                packed=json.loads(run(['npm','pack','--json','--ignore-scripts','--pack-destination',str(out)],pkg))[0]
                tarball=out/packed['filename']
                unpacked=pathlib.Path(tmp)/'unpacked';unpacked.mkdir()
                if extract(tarball,unpacked)!=names:raise Blocked('Dry-run/actual tar mismatch')
                scan(unpacked)
                payload={'artifact':tarball.name,'sha256':digest(tarball)}
                version=meta['version']
            else:
                if not a.clawhub_root:raise Blocked('Reviewed ClawHub CLI root required')
                report=json.loads(run(['node',str(src/'scripts/check-clawhub-package.mjs'),str(pkg),a.clawhub_root,'--offline'],src))
                names=sorted(f['path'] for f in report['files']);validate_names(names,policy['files'])
                staged=out/'skill';staged.mkdir()
                for name in names:
                    target=staged/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(pkg/name,target)
                scan(staged)
                payload={'hashes':{name:digest(staged/name) for name in names}}
                import re
                version=re.search(r'^\s*version:\s*[\'"]?([0-9]+\.[0-9]+\.[0-9]+)',(staged/'SKILL.md').read_text(),re.M).group(1)
            manifest={'package':a.package,'registry':policy['registry'],'version':version,'repository':policy['repository'],'commit':commit,'files':names,**payload}
            (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
            print(json.dumps(manifest,indent=2))
    else:
        ci_authorized(policy)
        manifest=json.loads((out/'manifest.json').read_text())
        if manifest['package']!=a.package or manifest['repository']!=policy['repository'] or manifest['registry']!=policy['registry']:raise Blocked('Artifact identity mismatch')
        if manifest['commit']!=run(['git','rev-parse','HEAD'],ROOT).decode().strip():raise Blocked('Artifact commit mismatch')
        validate_names(manifest['files'],policy['files'])
        if policy['registry']=='npm':
            artifact=verify_npm_artifact(out,manifest,policy,a.package)
            run(['npm','publish',str(artifact),'--ignore-scripts','--provenance','--access','public'],ROOT)
        else:
            if not a.clawhub_root:raise Blocked('Reviewed ClawHub CLI root required')
            staged=out/'skill'
            if files(staged)!=manifest['files'] or {n:digest(staged/n) for n in files(staged)}!=manifest['hashes']:raise Blocked('Skill changed after review')
            scan(staged)
            report=json.loads(run(['node',str(ROOT/'scripts/check-clawhub-package.mjs'),str(staged),a.clawhub_root],ROOT))
            validate_names([f['path'] for f in report['files']],policy['files'])
            run(['node',str(pathlib.Path(a.clawhub_root)/'bin/clawdhub.js'),'skill','publish',str(staged),'--slug',a.package,'--owner',policy['repository'].split('/')[0],'--version',manifest['version'],'--source-repo',policy['repository'],'--source-commit',manifest['commit'],'--json'],ROOT)
        print('Checked artifact published')
if __name__=='__main__':
    try:main()
    except Exception as e:
        print(str(e) if isinstance(e,Blocked) else 'Release gate failed; output suppressed',file=sys.stderr);sys.exit(1)
