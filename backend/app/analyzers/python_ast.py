import ast
import os
from pathlib import Path
from typing import List, Dict, Set, Optional, Tuple
from dataclasses import dataclass, field

@dataclass
class RawImport:
    source_module: str
    target_module: str
    line_number: int
    statement: str
    is_relative: bool = False

@dataclass
class ModuleInfo:
    name: str
    file_path: str
    classes_count: int
    functions_count: int
    imports: List[RawImport] = field(default_factory=list)

@dataclass
class AstAnalysisResult:
    modules: Dict[str, ModuleInfo]
    dependencies: List[RawImport]
    warnings: List[str]
    files_analyzed: int
    raw_dependencies: List[RawImport] = field(default_factory=list)

class ImportVisitor(ast.NodeVisitor):
    def __init__(self, current_module: str):
        self.current_module = current_module
        self.imports: List[RawImport] = []
        self.classes_count = 0
        self.functions_count = 0

    def visit_ClassDef(self, node: ast.ClassDef):
        self.classes_count += 1
        self.generic_visit(node)

    def visit_FunctionDef(self, node: ast.FunctionDef):
        self.functions_count += 1
        self.generic_visit(node)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef):
        self.functions_count += 1
        self.generic_visit(node)

    def visit_Import(self, node: ast.Import):
        for alias in node.names:
            stmt = f"import {alias.name}"
            if alias.asname:
                stmt += f" as {alias.asname}"
            self.imports.append(
                RawImport(
                    source_module=self.current_module,
                    target_module=alias.name,
                    line_number=node.lineno,
                    statement=stmt,
                    is_relative=False
                )
            )

    def visit_ImportFrom(self, node: ast.ImportFrom):
        level = node.level or 0
        base_module = node.module or ""
        
        target_base = ""
        is_rel = level > 0

        if is_rel:
            parts = self.current_module.split(".")
            # level 1 means current package
            if level <= len(parts):
                pkg_parts = parts[:-level]
                if base_module:
                    pkg_parts.append(base_module)
                target_base = ".".join(pkg_parts)
            else:
                target_base = base_module
        else:
            target_base = base_module

        for alias in node.names:
            if target_base:
                full_target = f"{target_base}.{alias.name}"
                stmt = f"from {target_base} import {alias.name}"
            else:
                full_target = alias.name
                stmt = f"from . import {alias.name}"
                
            self.imports.append(
                RawImport(
                    source_module=self.current_module,
                    target_module=full_target,
                    line_number=node.lineno,
                    statement=stmt,
                    is_relative=is_rel
                )
            )


def file_to_module_name(file_path: Path, root_dir: Path) -> str:
    """Converts a relative file path to a python dotted module name."""
    rel_path = file_path.relative_to(root_dir)
    parts = list(rel_path.parts)
    # Remove .py
    if parts[-1].endswith(".py"):
        parts[-1] = parts[-1][:-3]
    # If __init__, the package name is the parent folder
    if parts[-1] == "__init__":
        parts = parts[:-1]
    return ".".join(parts)


def discover_python_files(
    root_dir: Path,
    source_dirs: Optional[List[str]] = None,
    exclude_dirs: Optional[List[str]] = None
) -> List[Path]:
    """Finds all python source files respecting inclusion and exclusion rules."""
    excludes = set(exclude_dirs or [
        ".venv", "venv", "__pycache__", "tests", "dist", "build", "node_modules", ".git", ".idea", ".vscode"
    ])
    
    files: List[Path] = []
    
    # Check if specified source_dirs exist
    search_dirs = []
    if source_dirs:
        for sdir in source_dirs:
            candidate = root_dir / sdir.strip()
            if candidate.exists() and candidate.is_dir():
                search_dirs.append(candidate)
    
    if not search_dirs:
        search_dirs = [root_dir]

    for search_dir in search_dirs:
        for root, dirs, filenames in os.walk(search_dir):
            # Prune excluded directories
            dirs[:] = [d for d in dirs if d not in excludes and not d.startswith(".")]
            for filename in filenames:
                if filename.endswith(".py"):
                    full_path = Path(root) / filename
                    files.append(full_path)

    return sorted(files)


def analyze_python_source(
    root_dir: Path,
    source_dirs: Optional[List[str]] = None,
    exclude_dirs: Optional[List[str]] = None
) -> AstAnalysisResult:
    """Parses Python source files using Python AST to extract modules and dependencies."""
    py_files = discover_python_files(root_dir, source_dirs, exclude_dirs)
    modules: Dict[str, ModuleInfo] = {}
    all_dependencies: List[RawImport] = []
    warnings: List[str] = []

    # Map files to module names
    for py_file in py_files:
        try:
            rel_path_str = str(py_file.relative_to(root_dir)).replace("\\", "/")
            mod_name = file_to_module_name(py_file, root_dir)
            if not mod_name:
                continue

            with open(py_file, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()

            try:
                tree = ast.parse(content, filename=str(py_file))
            except SyntaxError as se:
                warnings.append(f"SyntaxError in {rel_path_str} line {se.lineno}: {se.msg}")
                continue

            visitor = ImportVisitor(current_module=mod_name)
            visitor.visit(tree)

            mod_info = ModuleInfo(
                name=mod_name,
                file_path=rel_path_str,
                classes_count=visitor.classes_count,
                functions_count=visitor.functions_count,
                imports=visitor.imports
            )
            modules[mod_name] = mod_info
            all_dependencies.extend(visitor.imports)

        except Exception as e:
            warnings.append(f"Error parsing {py_file.name}: {str(e)}")

    # Filter dependencies to only internal/project modules where applicable
    # or identify which imports match project modules
    known_prefixes = set(modules.keys())
    resolved_dependencies: List[RawImport] = []

    for dep in all_dependencies:
        # Check if dep.target_module or any prefix of it matches a known project module
        matched_target = None
        target_parts = dep.target_module.split(".")
        for i in range(len(target_parts), 0, -1):
            prefix = ".".join(target_parts[:i])
            if prefix in known_prefixes:
                matched_target = prefix
                break

            # Also check if prefix is within the same subpackage root
            src_parts = dep.source_module.split(".")
            if len(src_parts) > 1:
                candidate = f"{src_parts[0]}.{prefix}"
                if candidate in known_prefixes:
                    matched_target = candidate
                    break

            # Also check if prefix matches any known module as suffix
            for kp in sorted(known_prefixes, key=len):
                if kp == prefix or kp.endswith("." + prefix):
                    matched_target = kp
                    break

            if matched_target:
                break

        if matched_target and matched_target != dep.source_module:
            resolved_dependencies.append(
                RawImport(
                    source_module=dep.source_module,
                    target_module=matched_target,
                    line_number=dep.line_number,
                    statement=dep.statement,
                    is_relative=dep.is_relative
                )
            )

    return AstAnalysisResult(
        modules=modules,
        dependencies=resolved_dependencies,
        warnings=warnings,
        files_analyzed=len(py_files),
        raw_dependencies=all_dependencies
    )
