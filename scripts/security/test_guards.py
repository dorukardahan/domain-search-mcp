import contextlib, io, json, os, pathlib, subprocess, tarfile, tempfile, unittest
from secret_guard import Blocked, checked_write, scan, snapshot_index
from release import validate_names, extract, ci_authorized, verify_npm_artifact, digest
class GuardTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.tmp.name)
    def tearDown(self):self.tmp.cleanup()
    def test_plaintext_password_blocked_no_value_output(self):
        value='Synthetic'+'Only784!' # generated fixture, never a real credential
        (self.root/'note.md').write_text('dashboard password: '+value)
        out=io.StringIO()
        with contextlib.redirect_stdout(out),self.assertRaises(Blocked):scan(self.root)
        self.assertNotIn(value,out.getvalue());self.assertIn('contextual-plaintext-password',out.getvalue())
    def test_api_token_blocked(self):
        value='ghp_'+'aB7cD9eF2gH4iJ6kL8mN0pQ3rS5tU7vW9xY1'
        (self.root/'note.md').write_text(value)
        with contextlib.redirect_stdout(io.StringIO()),self.assertRaises(Blocked):scan(self.root)
    def test_wallet_seed_private_key_and_turkish_prose(self):
        fixtures = ['seed: '+('alpha beta gamma delta '*3).strip(),
                    'private_key: '+('ab12cd34'*8),
                    'dashboard '+ 'şifresi'+' '+chr(96)+'Synthetic'+'Only784!'+chr(96)]
        for content in fixtures:
            (self.root/'note.md').write_text(content)
            out=io.StringIO()
            with contextlib.redirect_stdout(out),self.assertRaises(Blocked):scan(self.root)
            self.assertNotIn(content,out.getvalue())
    def test_reference_allowed(self):
        (self.root/'note.md').write_text('Credential reference: secret-store/service-login')
        scan(self.root)
    def test_failed_write_preserves_original_and_permissions(self):
        dest=self.root/'memory.md';dest.write_text('original');mode=dest.stat().st_mode
        with contextlib.redirect_stdout(io.StringIO()),self.assertRaises(Blocked):checked_write(dest,('password: '+'Synthetic'+'Only784!').encode())
        self.assertEqual(dest.read_text(),'original');self.assertEqual(mode,dest.stat().st_mode)
    def test_safe_write(self):
        dest=self.root/'memory.md';checked_write(dest,b'Credential reference: secret-store/demo');self.assertTrue(dest.exists())
    def test_staged_full_blob_not_worktree(self):
        subprocess.run(['git','init','-q',str(self.root)],check=True)
        f=self.root/'sample.md';f.write_text('password: '+'Synthetic'+'Only784!')
        subprocess.run(['git','-C',str(self.root),'add','sample.md'],check=True);f.write_text('clean working tree')
        old=os.getcwd()
        try:
            os.chdir(self.root)
            with tempfile.TemporaryDirectory() as t:
                snapshot_index(pathlib.Path(t))
                with contextlib.redirect_stdout(io.StringIO()),self.assertRaises(Blocked):scan(t)
        finally:os.chdir(old)
    def test_allowlist_extra_missing_duplicate(self):
        for names in [['index.js','memory/note.md'],[],['index.js','index.js']]:
            with self.assertRaises(Blocked):validate_names(names,['index.js'])
        validate_names(['index.js'],['index.js'])
    def test_tar_path_and_link_rejected(self):
        for name,kind in [('package/../escape',tarfile.REGTYPE),('package/link',tarfile.SYMTYPE)]:
            tarball=self.root/'bad.tgz'
            with tarfile.open(tarball,'w:gz') as t:
                info=tarfile.TarInfo(name);info.type=kind;t.addfile(info)
            with self.assertRaises(Blocked):extract(tarball,self.root/'out')
    def test_symlink_rejected(self):
        (self.root/'link').symlink_to('/dev/null')
        with self.assertRaises(Blocked):scan(self.root)
    def test_local_publish_no_approval_denied(self):
        old=os.environ.pop('GITHUB_ACTIONS',None)
        try:
            with self.assertRaises(Blocked):ci_authorized({'repository':'example/project','automatic':False})
        finally:
            if old is not None:os.environ['GITHUB_ACTIONS']=old
    def test_artifact_tampering_rejected_before_any_upload(self):
        artifact=self.root/'package.tgz';artifact.write_bytes(b'original synthetic artifact')
        manifest={'artifact':artifact.name,'sha256':digest(artifact)}
        artifact.write_bytes(b'tampered synthetic artifact')
        with self.assertRaises(Blocked):verify_npm_artifact(self.root,manifest,{'files':[]},'example-package')
    def test_repo_ignore_cannot_hide_secret(self):
        (self.root/'.gitignore').write_text('note.md\n')
        (self.root/'note.md').write_text('password: '+'Synthetic'+'Only784!')
        with contextlib.redirect_stdout(io.StringIO()),self.assertRaises(Blocked):scan(self.root)
    def test_missing_scanner_fails_closed(self):
        old=os.environ.get('GITLEAKS_BIN');os.environ['GITLEAKS_BIN']='/nonexistent/scanner'
        try:
            with self.assertRaises((Blocked,FileNotFoundError)):scan(self.root)
        finally:
            if old is None:os.environ.pop('GITLEAKS_BIN',None)
            else:os.environ['GITLEAKS_BIN']=old
if __name__=='__main__':unittest.main(verbosity=2)
