"""Run Cargo's development binary inside a named macOS application bundle."""

import json
import os
from pathlib import Path
import plistlib
import shutil
import sys


def prepare_app(binary: Path) -> Path:
    root = Path(__file__).resolve().parents[1]
    config = json.loads((root / "tauri.conf.json").read_text())
    name = config["productName"]
    contents = binary.parent / "dev-bundle" / f"{name}.app" / "Contents"
    executable = contents / "MacOS" / binary.name
    resources = contents / "Resources"
    executable.parent.mkdir(parents=True, exist_ok=True)
    resources.mkdir(parents=True, exist_ok=True)

    # Replace atomically so an existing running copy never gets overwritten.
    temporary = executable.with_suffix(".new")
    shutil.copy2(binary, temporary)
    temporary.replace(executable)
    shutil.copy2(root / "icons" / "icon.icns", resources / "icon.icns")
    info = plistlib.loads((root / "Info.plist").read_bytes())
    info.update({
        "CFBundleName": name,
        "CFBundleDisplayName": name,
        "CFBundleExecutable": binary.name,
        "CFBundleIdentifier": config["identifier"],
        "CFBundlePackageType": "APPL",
        "CFBundleIconFile": "icon.icns",
        "CFBundleShortVersionString": config["version"],
        "CFBundleVersion": config["version"],
        "NSHighResolutionCapable": True,
    })
    (contents / "Info.plist").write_bytes(plistlib.dumps(info))
    return executable


if __name__ == "__main__":
    binary = Path(sys.argv[1]).resolve()
    # Cargo also uses its runner for tests and examples; leave those untouched.
    executable = prepare_app(binary) if binary.name == "odoo-to-do" else binary
    # Keep the PID, arguments, environment and streams so Tauri's watcher can
    # stop/restart the app normally, while Vite continues to provide hot reload.
    os.execv(str(executable), [str(executable), *sys.argv[2:]])
