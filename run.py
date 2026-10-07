#!/usr/bin/env python3
"""
A.I. Duet — One-Click Runner.

Starts the FastAPI + ONNX Runtime backend and serves the pre-built web application.
No Node.js or npm required for playing!

Usage:
    python3 run.py
    python3 run.py --port 8080 --no-browser
"""

import argparse
import os
import sys
import time
import webbrowser

REPO_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_DIR = os.path.join(REPO_DIR, "server")
DIST_INDEX = os.path.join(REPO_DIR, "static", "dist", "index.html")

REQUIRED_MODULES = [
    ("fastapi", "fastapi"),
    ("uvicorn", "uvicorn"),
    ("onnxruntime", "onnxruntime"),
    ("pretty_midi", "pretty_midi"),
    ("note_seq", "note_seq"),
    ("numpy", "numpy"),
]


def check_dependencies():
    missing = []
    for mod_name, pkg_name in REQUIRED_MODULES:
        try:
            __import__(mod_name)
        except ImportError:
            missing.append(pkg_name)

    if missing:
        print("\n" + "=" * 60)
        print("  Missing Required Python Packages:")
        for pkg in missing:
            print(f"    - {pkg}")
        print("\n  Please install dependencies by running:")
        print(f"    pip install -r {os.path.join('server', 'requirements.txt')}")
        print("=" * 60 + "\n")
        sys.exit(1)


def check_built_frontend():
    if not os.path.exists(DIST_INDEX):
        print("\n[Warning] Pre-built frontend bundle not found at:")
        print(f"  {DIST_INDEX}")
        print("If you are developing the frontend, run:")
        print("  cd static && npm install && npm run build\n")


def main():
    parser = argparse.ArgumentParser(description="Start A.I. Duet")
    parser.add_argument("--host", default="127.0.0.1", help="Host address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8080, help="Port to listen on (default: 8080)")
    parser.add_argument("--no-browser", action="store_true", help="Do not automatically open browser")
    parser.add_argument("--reload", action="store_true", help="Enable code hot-reloading for development")
    args = parser.parse_args()

    check_dependencies()
    check_built_frontend()

    url = f"http://{args.host}:{args.port}"

    print("\n" + "=" * 60)
    print("  🎹  A.I. Duet 2.0 (FastAPI + ONNX Runtime)")
    print(f"  🌐  Web App URL: {url}")
    print("=" * 60 + "\n")

    if not args.no_browser:
        import threading
        def open_browser():
            time.sleep(1.2)
            try:
                webbrowser.open(url)
            except Exception:
                pass
        threading.Thread(target=open_browser, daemon=True).start()

    sys.path.insert(0, SERVER_DIR)
    import uvicorn

    uvicorn.run(
        "server:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        app_dir=SERVER_DIR,
        log_level="info",
    )


if __name__ == "__main__":
    main()
