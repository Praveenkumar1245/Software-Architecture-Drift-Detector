import os
import zipfile
import shutil
from pathlib import Path
from typing import List, Tuple
from backend.app.core.config import settings

class SafeExtractionError(Exception):
    pass

def sanitize_and_extract_zip(zip_path: Path, target_dir: Path) -> List[Path]:
    """
    Safely extracts a ZIP archive into target_dir preventing:
    - Path traversal attacks (Zip Slip)
    - Extraction outside target_dir
    - Excessive file count (Zip bombs)
    - File size limits
    """
    if not zip_path.exists():
        raise SafeExtractionError("Archive file does not exist")

    file_size = zip_path.stat().st_size
    if file_size > settings.MAX_UPLOAD_SIZE_BYTES:
        raise SafeExtractionError(f"Archive exceeds maximum allowed size ({settings.MAX_UPLOAD_SIZE_BYTES} bytes)")

    # Clean target directory if exists
    if target_dir.exists():
        shutil.rmtree(target_dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    target_dir_abs = os.path.abspath(target_dir)

    extracted_files: List[Path] = []

    try:
        with zipfile.ZipFile(zip_path, 'r') as archive:
            infolist = archive.infolist()
            if len(infolist) > settings.MAX_EXTRACTED_FILES:
                raise SafeExtractionError(f"Archive contains too many files ({len(infolist)} > {settings.MAX_EXTRACTED_FILES})")

            for member in infolist:
                # Security checks
                filename = member.filename
                # Prevent traversal patterns
                if ".." in filename or filename.startswith("/") or filename.startswith("\\"):
                    raise SafeExtractionError(f"Unsafe path detected in archive: {filename}")

                resolved_path = os.path.abspath(os.path.join(target_dir_abs, filename))
                
                # Check that resolved path is strictly within target_dir
                try:
                    common = os.path.commonpath([target_dir_abs, resolved_path])
                    if common != target_dir_abs:
                        raise SafeExtractionError(f"Path traversal attempted: {filename}")
                except ValueError:
                    raise SafeExtractionError(f"Path traversal attempted: {filename}")

                if member.is_dir():
                    os.makedirs(resolved_path, exist_ok=True)
                else:
                    os.makedirs(os.path.dirname(resolved_path), exist_ok=True)
                    with archive.open(member) as source, open(resolved_path, "wb") as target:
                        shutil.copyfileobj(source, target)
                    extracted_files.append(Path(resolved_path))

    except zipfile.BadZipFile:
        raise SafeExtractionError("Corrupt or invalid ZIP archive")
    except Exception as e:
        if not isinstance(e, SafeExtractionError):
            raise SafeExtractionError(f"Extraction failed: {str(e)}")
        raise

    return extracted_files
