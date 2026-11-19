"""Generate native Flutter runners from the pinned SDK, then apply the shell."""
from pathlib import Path
import shutil
import subprocess

source = Path(__file__).resolve().parent
project = source / 'build' / 'native'
flutter = shutil.which('flutter')
if flutter is None:
    raise RuntimeError('Flutter SDK executable is not available on PATH')
subprocess.run([flutter, 'create', '--no-pub', '--platforms=android,windows,macos',
                '--org=eu.zerver', '--project-name=opdracht', str(project)], check=True)
for name in ['lib', 'test']:
    shutil.rmtree(project / name, ignore_errors=True)
    shutil.copytree(source / name, project / name)
shutil.copy2(source / 'pubspec.yaml', project / 'pubspec.yaml')
(project / 'assets').mkdir(exist_ok=True)
shutil.copy2(source / 'native-icons/app_icon_32.png', project / 'assets/app_icon_32.png')
if (source / 'pubspec.lock').exists():
    shutil.copy2(source / 'pubspec.lock', project / 'pubspec.lock')
(project / 'analysis_options.yaml').unlink(missing_ok=True)
# The website and Authentik use HTTPS; no cleartext exception or certificate bypass.
manifest = project / 'android/app/src/main/AndroidManifest.xml'
text = manifest.read_text().replace('<application', '<uses-permission android:name="android.permission.INTERNET"/>\n    <application android:usesCleartextTraffic="false"')
text = text.replace('android:label="opdracht"', 'android:label="Opdracht"')
manifest.write_text(text)
# Use the existing Opdracht identity, not the generated Flutter launcher icon.
resources = project / 'android/app/src/main/res'
for directory in ['drawable', 'mipmap-anydpi-v26']:
    (resources / directory).mkdir(parents=True, exist_ok=True)
shutil.copytree(source / 'android-res', resources, dirs_exist_ok=True, ignore=shutil.ignore_patterns('*.kt'))
# Select the vector mipmap on older devices and adaptive icon on API 26+.
for density in ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']:
    (resources / f'mipmap-{density}' / 'ic_launcher.png').unlink(missing_ok=True)

# All desktop launchers use the same mark as Android and the website.
shutil.copy2(source / 'native-icons/app_icon.ico', project / 'windows/runner/resources/app_icon.ico')
mac_icons = project / 'macos/Runner/Assets.xcassets/AppIcon.appiconset'
for size in [16, 32, 64, 128, 256, 512, 1024]:
    shutil.copy2(source / f'native-icons/app_icon_{size}.png', mac_icons / f'app_icon_{size}.png')

# Keep the screen awake only while this Android activity is resumed and charging.
activity = project / 'android/app/src/main/kotlin/eu/zerver/opdracht/MainActivity.kt'
shutil.copy2(source / 'android-res/MainActivity.kt', activity)

for name in ['DebugProfile.entitlements', 'Release.entitlements']:
    target = project / 'macos/Runner' / name
    text = target.read_text()
    if 'com.apple.security.network.client' not in text:
        text = text.replace('</dict>', '<key>com.apple.security.network.client</key><true/>\n</dict>')
    target.write_text(text)
# Personal, ad-hoc signed Apple Silicon Mac build; no developer account needed.
target = project / 'macos/Runner.xcodeproj/project.pbxproj'
text = target.read_text()
assert 'CODE_SIGN_STYLE = Automatic;' in text, 'Unexpected Flutter macOS signing template'
text = text.replace('CODE_SIGN_STYLE = Automatic;', 'CODE_SIGN_STYLE = Manual;\n\t\t\t\tCODE_SIGN_IDENTITY = "-";\n\t\t\t\tARCHS = arm64;\n\t\t\t\tONLY_ACTIVE_ARCH = NO;')
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

# Draw branded desktop chrome while retaining native window management.
shutil.copy2(source / 'windows/window_chrome.h', project / 'windows/runner/window_chrome.h')
header = project / 'windows/runner/flutter_window.h'
text = header.read_text().replace('#include <memory>', '#include <memory>\n#include <flutter/method_channel.h>')
text = text.replace('  flutter::DartProject project_;', '  flutter::DartProject project_;\n  std::unique_ptr<flutter::MethodChannel<flutter::EncodableValue>> window_channel_;')
header.write_text(text)
target = project / 'windows/runner/flutter_window.cpp'
text = target.read_text().replace('#include "flutter_window.h"', '#include "flutter_window.h"\n#include "window_chrome.h"')
anchor = '  RegisterPlugins(flutter_controller_->engine());'
assert anchor in text, 'Unexpected Windows plugin registration template'
text = text.replace(anchor, anchor + '\n  window_channel_ = ConfigureOpdrachtWindow(flutter_controller_->engine()->messenger(), GetHandle());')
text = text.replace('  // Give Flutter, including plugins,', '  if (const auto chrome = OpdrachtChromeMessage(hwnd, message, wparam, lparam)) return *chrome;\n  // Give Flutter, including plugins,')
text = text.replace('  if (flutter_controller_) {\n    flutter_controller_ = nullptr;', '  window_channel_.reset();\n  if (flutter_controller_) {\n    flutter_controller_ = nullptr;')
target.write_text(text)
shutil.copy2(source / 'macos/MainFlutterWindow.swift', project / 'macos/Runner/MainFlutterWindow.swift')

target = project / 'windows/runner/main.cpp'
text = target.read_text().replace('window.Create(L"opdracht"', 'window.Create(L"Opdracht"')
target.write_text(text)
