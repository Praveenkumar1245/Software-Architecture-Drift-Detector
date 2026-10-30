import zipfile
from pathlib import Path

def create_sample_zip():
    base_dir = Path(__file__).resolve().parent.parent
    sample_dir = base_dir / "sample-project"
    zip_path = base_dir / "sample-project.zip"

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for file in sample_dir.rglob("*.py"):
            arcname = file.relative_to(sample_dir)
            zipf.write(file, arcname)

    print(f"Created {zip_path} successfully.")

if __name__ == "__main__":
    create_sample_zip()
