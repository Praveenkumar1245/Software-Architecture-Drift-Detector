import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.app.main import app

for r in app.router.routes:
    methods = getattr(r, "methods", None)
    if methods:
        clean_methods = ",".join(m for m in methods if m not in ("HEAD", "OPTIONS"))
        print(f"{clean_methods:<8} {r.path}")
    elif hasattr(r, "path"):
        print(f"ROUTER   {r.path}")
