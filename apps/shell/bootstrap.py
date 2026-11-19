"""Generate native Flutter runners from the pinned SDK, then apply the shell."""
from pathlib import Path
import shutil
import subprocess

source = Path(__file__).resolve().parent
project = source / 'build' / 'native'
subprocess.run(['flutter', 'create', '--no-pub', '--platforms=android,windows,macos',
                '--org=eu.zerver', '--project-name=opdracht', str(project)], check=True)
for name in ['lib', 'test']:
    shutil.rmtree(project / name, ignore_errors=True)
    shutil.copytree(source / name, project / name)
shutil.copy2(source / 'pubspec.yaml', project / 'pubspec.yaml')
if (source / 'pubspec.lock').exists():
    shutil.copy2(source / 'pubspec.lock', project / 'pubspec.lock')
(project / 'analysis_options.yaml').unlink(missing_ok=True)
# The website and Authentik use HTTPS; no cleartext exception or certificate bypass.
manifest = project / 'android/app/src/main/AndroidManifest.xml'
text = manifest.read_text().replace('<application', '<uses-permission android:name="android.permission.INTERNET"/>\n    <application android:usesCleartextTraffic="false"')
manifest.write_text(text)
for name in ['DebugProfile.entitlements', 'Release.entitlements']:
    target = project / 'macos/Runner' / name
    text = target.read_text()
    if 'com.apple.security.network.client' not in text:
        text = text.replace('</dict>', '<key>com.apple.security.network.client</key><true/>\n</dict>')
    target.write_text(text)
# Personal, ad-hoc signed universal Mac build; no developer account needed.
target = project / 'macos/Runner.xcodeproj/project.pbxproj'
text = target.read_text()
assert 'CODE_SIGN_STYLE = Automatic;' in text, 'Unexpected Flutter macOS signing template'
text = text.replace('CODE_SIGN_STYLE = Automatic;', 'CODE_SIGN_STYLE = Manual;\n\t\t\t\tCODE_SIGN_IDENTITY = "-";\n\t\t\t\tARCHS = "arm64 x86_64";\n\t\t\t\tONLY_ACTIVE_ARCH = NO;')
target.write_text(text)
# Installable Android release with a stable private signing key, supplied by CI.
target = project / 'android/app/build.gradle.kts'
text = target.read_text()
assert 'signingConfig = signingConfigs.getByName("debug")' in text, 'Unexpected Flutter Android signing template'
text = text.replace('android {', '''android {
    signingConfigs {
        create("personal") {
            storeType = "PKCS12"
            storeFile = file(System.getenv("OPDRACHT_KEYSTORE_PATH"))
            storePassword = System.getenv("OPDRACHT_KEYSTORE_PASSWORD")
            keyAlias = "opdracht"
            keyPassword = System.getenv("OPDRACHT_KEYSTORE_PASSWORD")
        }
    }
''', 1).replace('signingConfig = signingConfigs.getByName("debug")', 'signingConfig = signingConfigs.getByName("personal")')
target.write_text(text)
print(f'Native shell generated: {project}')
