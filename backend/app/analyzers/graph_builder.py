import fnmatch
from typing import Dict, List, Optional, Tuple, Set
import networkx as nx
from backend.app.analyzers.python_ast import ModuleInfo, RawImport
from backend.app.schemas.architecture import ComponentDef, ArchitectureDefinitionContent

class ArchitectureGraph:
    def __init__(self, definition: Optional[ArchitectureDefinitionContent] = None):
        self.definition = definition
        self.module_graph = nx.DiGraph()
        self.component_graph = nx.DiGraph()
        self.module_to_component: Dict[str, Optional[str]] = {}
        self.component_defs: Dict[str, ComponentDef] = {}
        if definition:
            for comp in definition.components:
                self.component_defs[comp.name] = comp

    def map_module_to_component(self, module_info: ModuleInfo) -> Optional[str]:
        """Maps a module to an architecture component using path patterns or module naming."""
        if not self.definition:
            return None

        file_path_clean = module_info.file_path.replace("\\", "/").lower()
        module_name_clean = module_info.name.lower()

        # 1. Match explicit path patterns first
        for comp in self.definition.components:
            for pattern in comp.path_patterns:
                pat = pattern.lower().strip()
                if fnmatch.fnmatch(file_path_clean, pat) or fnmatch.fnmatch(file_path_clean, f"*/{pat}"):
                    return comp.name
                if fnmatch.fnmatch(module_name_clean, pat):
                    return comp.name

        # 2. Match component name in file path segments or module name segments
        for comp in self.definition.components:
            c_name = comp.name.lower()
            path_segments = [p.lower() for p in file_path_clean.split("/")]
            module_segments = [m.lower() for m in module_name_clean.split(".")]

            if c_name in path_segments or c_name in module_segments:
                return comp.name

        return None

    def build(self, modules: Dict[str, ModuleInfo], dependencies: List[RawImport]):
        """Constructs module and component directed graphs with metadata."""
        # 1. Map all modules
        for mod_name, mod_info in modules.items():
            comp_name = self.map_module_to_component(mod_info)
            self.module_to_component[mod_name] = comp_name

            layer = None
            if comp_name and comp_name in self.component_defs:
                layer = self.component_defs[comp_name].layer

            self.module_graph.add_node(
                mod_name,
                label=mod_name,
                component=comp_name,
                layer=layer,
                file_path=mod_info.file_path,
                classes_count=mod_info.classes_count,
                functions_count=mod_info.functions_count,
                imports_count=len(mod_info.imports)
            )

        # 2. Add edges for dependencies
        for dep in dependencies:
            if dep.source_module in modules and dep.target_module in modules:
                src_comp = self.module_to_component.get(dep.source_module)
                tgt_comp = self.module_to_component.get(dep.target_module)

                self.module_graph.add_edge(
                    dep.source_module,
                    dep.target_module,
                    line_number=dep.line_number,
                    statement=dep.statement,
                    source_component=src_comp,
                    target_component=tgt_comp
                )

                if src_comp and tgt_comp:
                    if not self.component_graph.has_edge(src_comp, tgt_comp):
                        self.component_graph.add_edge(
                            src_comp,
                            tgt_comp,
                            dependencies_count=1,
                            sample_statement=dep.statement
                        )
                    else:
                        self.component_graph[src_comp][tgt_comp]["dependencies_count"] += 1

        # 3. Ensure all defined components are nodes in component graph
        if self.definition:
            for comp in self.definition.components:
                if comp.name not in self.component_graph:
                    self.component_graph.add_node(
                        comp.name,
                        layer=comp.layer,
                        description=comp.description
                    )

    def find_module_cycles(self) -> List[List[str]]:
        """Finds directed dependency cycles between modules."""
        try:
            return list(nx.simple_cycles(self.module_graph))
        except Exception:
            return []

    def find_component_cycles(self) -> List[List[str]]:
        """Finds directed dependency cycles between components."""
        try:
            return list(nx.simple_cycles(self.component_graph))
        except Exception:
            return []
