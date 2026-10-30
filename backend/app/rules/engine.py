from typing import List, Dict, Optional, Tuple, Set
from dataclasses import dataclass, field
import uuid
from backend.app.schemas.architecture import ArchitectureDefinitionContent, RuleDef, ComponentDef
from backend.app.analyzers.graph_builder import ArchitectureGraph
from backend.app.analyzers.python_ast import ModuleInfo, RawImport

@dataclass
class FindingDraft:
    rule_id: str
    rule_type: str
    title: str
    explanation: str
    severity: str
    source_module: Optional[str] = None
    target_module: Optional[str] = None
    source_component: Optional[str] = None
    target_component: Optional[str] = None
    file_path: Optional[str] = None
    line_number: Optional[int] = None
    expected_behavior: Optional[str] = None
    actual_behavior: Optional[str] = None
    evidence: Optional[str] = None
    confidence: str = "high"
    remediation: Optional[str] = None

class DriftDetectionEngine:
    def __init__(self, definition: ArchitectureDefinitionContent, graph: ArchitectureGraph):
        self.definition = definition
        self.graph = graph
        self.findings: List[FindingDraft] = []
        self.violated_rule_ids: Set[str] = set()
        self.total_applicable_rules = 0

    def evaluate(
        self,
        modules: Dict[str, ModuleInfo],
        dependencies: List[RawImport],
        raw_dependencies: Optional[List[RawImport]] = None
    ) -> Tuple[List[FindingDraft], float]:
        """
        Runs all drift detection rules against the dependency graph.
        Returns:
            Tuple of (findings_list, compliance_percentage)
        """
        self.findings = []
        self.violated_rule_ids = set()
        raw_deps = raw_dependencies if raw_dependencies is not None else dependencies
        
        # Count explicit rules + implicit component rules
        rule_count = len(self.definition.rules)
        for comp in self.definition.components:
            rule_count += len(comp.allowed_dependencies) + len(comp.forbidden_dependencies) + len(comp.required_dependencies)
        self.total_applicable_rules = max(1, rule_count)

        # 1. Check Missing Expected Components
        self._check_missing_components(modules)

        # 2. Check Unmapped Modules
        self._check_unmapped_modules(modules)

        # 3. Check Forbidden Dependencies (both component-level definitions and explicit rules)
        self._check_forbidden_dependencies(dependencies)

        # 4. Check Forbidden Imports (explicit forbidden external and package imports)
        self._check_forbidden_imports(raw_deps)

        # 5. Check Layer Direction Violations
        self._check_layer_violations(dependencies)

        # 6. Check Unexpected Dependencies (whitelist violations)
        self._check_unexpected_dependencies(dependencies)

        # 7. Check Missing Required Dependencies
        self._check_missing_required_dependencies()

        # 8. Check Circular Dependencies (component and module cycles)
        self._check_circular_dependencies()

        # 9. Check Architectural Decision Violations (ADR)
        self._check_adr_violations(raw_deps)

        # Compute compliance percentage: 100 * (1 - violated_rules / total_rules)
        violated_count = len(self.violated_rule_ids)
        compliance = max(0.0, min(100.0, 100.0 * (1.0 - (violated_count / self.total_applicable_rules))))

        return self.findings, round(compliance, 1)

    def _check_missing_components(self, modules: Dict[str, ModuleInfo]):
        rule_id = "CORE-MISSING-COMPONENT"
        active_components = set(self.graph.module_to_component.values())
        for comp in self.definition.components:
            if comp.name not in active_components:
                self.violated_rule_ids.add(f"{rule_id}:{comp.name}")
                self.findings.append(
                    FindingDraft(
                        rule_id=rule_id,
                        rule_type="missing_component",
                        title=f"Missing Component: '{comp.name}'",
                        explanation=f"The intended architecture defines component '{comp.name}', but no source files or modules matched this component.",
                        severity="medium",
                        target_component=comp.name,
                        expected_behavior=f"Project should contain modules implementing component '{comp.name}'.",
                        actual_behavior=f"Zero source modules mapped to component '{comp.name}'.",
                        evidence=f"Configured patterns: {comp.path_patterns or [comp.name]}",
                        confidence="high",
                        remediation=f"Verify if component '{comp.name}' has been created or update component path patterns in the architecture definition."
                    )
                )

    def _check_unmapped_modules(self, modules: Dict[str, ModuleInfo]):
        rule_id = "CORE-UNMAPPED-MODULE"
        # Check if an explicit unmapped_module rule exists or check by default
        has_rule = any(r.type == "unmapped_module" for r in self.definition.rules)
        severity = "medium"
        for r in self.definition.rules:
            if r.type == "unmapped_module":
                rule_id = r.id
                severity = r.severity
                break

        for mod_name, comp_name in self.graph.module_to_component.items():
            if comp_name is None:
                mod_info = modules.get(mod_name)
                f_path = mod_info.file_path if mod_info else mod_name
                self.violated_rule_ids.add(f"{rule_id}:{mod_name}")
                self.findings.append(
                    FindingDraft(
                        rule_id=rule_id,
                        rule_type="unmapped_module",
                        title=f"Unmapped Module: '{mod_name}'",
                        explanation=f"The module '{mod_name}' cannot be assigned to any defined architecture component.",
                        severity=severity,
                        source_module=mod_name,
                        file_path=f_path,
                        expected_behavior="All source modules should map to approved architecture components.",
                        actual_behavior=f"Module '{mod_name}' is unassigned to any component.",
                        evidence=f"File path: {f_path}",
                        confidence="high",
                        remediation="Add a mapping pattern for this module in architecture definition or relocate file to the appropriate component directory."
                    )
                )

    def _check_forbidden_dependencies(self, dependencies: List[RawImport]):
        # Collect forbidden rules
        forbidden_pairs: Dict[Tuple[str, str], Tuple[str, str, str]] = {} # (from, to) -> (rule_id, severity, description)

        # From explicit rules
        for r in self.definition.rules:
            if r.type == "forbidden_dependency" and r.from_component and r.to_component:
                forbidden_pairs[(r.from_component, r.to_component)] = (r.id, r.severity, r.description)

        # From component definitions
        for comp in self.definition.components:
            for forbidden_target in comp.forbidden_dependencies:
                rule_id = f"RULE-FORBIDDEN-{comp.name.upper()}-TO-{forbidden_target.upper()}"
                if (comp.name, forbidden_target) not in forbidden_pairs:
                    forbidden_pairs[(comp.name, forbidden_target)] = (
                        rule_id,
                        "high",
                        f"Component '{comp.name}' is strictly forbidden from depending on '{forbidden_target}'."
                    )

        # Evaluate against actual dependencies
        for dep in dependencies:
            src_comp = self.graph.module_to_component.get(dep.source_module)
            tgt_comp = self.graph.module_to_component.get(dep.target_module)

            if src_comp and tgt_comp and (src_comp, tgt_comp) in forbidden_pairs:
                rule_id, severity, desc = forbidden_pairs[(src_comp, tgt_comp)]
                self.violated_rule_ids.add(rule_id)
                mod_info = self.graph.module_graph.nodes.get(dep.source_module, {})
                file_path = mod_info.get("file_path", "")

                self.findings.append(
                    FindingDraft(
                        rule_id=rule_id,
                        rule_type="forbidden_dependency",
                        title=f"Forbidden Dependency: '{src_comp}' -> '{tgt_comp}'",
                        explanation=f"Module '{dep.source_module}' in '{src_comp}' imports '{dep.target_module}' in '{tgt_comp}'. {desc}",
                        severity=severity,
                        source_module=dep.source_module,
                        target_module=dep.target_module,
                        source_component=src_comp,
                        target_component=tgt_comp,
                        file_path=file_path,
                        line_number=dep.line_number,
                        expected_behavior=f"Component '{src_comp}' must not depend on component '{tgt_comp}'.",
                        actual_behavior=f"Direct dependency detected via '{dep.statement}' at line {dep.line_number}.",
                        evidence=f"{file_path}:{dep.line_number} -> {dep.statement}",
                        confidence="high",
                        remediation=f"Remove the import of '{dep.target_module}' from '{dep.source_module}'. Use dependency injection or an intermediary abstraction."
                    )
                )

    def _check_forbidden_imports(self, raw_dependencies: List[RawImport]):
        forbidden_import_rules = [r for r in self.definition.rules if r.type == "forbidden_import"]
        if not forbidden_import_rules:
            return

        for rule in forbidden_import_rules:
            target = rule.target_module or rule.to_component or (rule.config.get("target") if rule.config else None)
            if not target:
                continue

            target_clean = target.lower().strip()
            for dep in raw_dependencies:
                src_comp = self.graph.module_to_component.get(dep.source_module)
                if rule.from_component and src_comp != rule.from_component:
                    continue

                dep_target_clean = dep.target_module.lower().strip()
                statement_clean = dep.statement.lower()

                matches = (
                    dep_target_clean == target_clean
                    or dep_target_clean.startswith(f"{target_clean}.")
                    or f"import {target_clean}" in statement_clean
                    or f"from {target_clean}" in statement_clean
                )

                if matches:
                    self.violated_rule_ids.add(rule.id)
                    mod_info = self.graph.module_graph.nodes.get(dep.source_module, {})
                    file_path = mod_info.get("file_path", "")

                    self.findings.append(
                        FindingDraft(
                            rule_id=rule.id,
                            rule_type="forbidden_import",
                            title=f"Forbidden Import: '{target}'",
                            explanation=f"Module '{dep.source_module}' imports prohibited external module/package '{target}'. {rule.description}",
                            severity=rule.severity,
                            source_module=dep.source_module,
                            target_module=dep.target_module,
                            source_component=src_comp,
                            file_path=file_path,
                            line_number=dep.line_number,
                            expected_behavior=f"Imports of package/module '{target}' are strictly prohibited.",
                            actual_behavior=f"Prohibited import statement detected: '{dep.statement}' at line {dep.line_number}.",
                            evidence=f"{file_path}:{dep.line_number} -> {dep.statement}",
                            confidence="high",
                            remediation=f"Remove the import of '{target}' from '{dep.source_module}' or refactor to use an approved boundary module."
                        )
                    )

    def _check_layer_violations(self, dependencies: List[RawImport]):
        # Check layer direction rules
        layer_rules = [r for r in self.definition.rules if r.type == "layer_direction"]
        # Default layer rule if components have layer numbers
        has_layers = any(c.layer is not None for c in self.definition.components)

        if not layer_rules and has_layers:
            # Create a default downward layer rule
            layer_rules = [
                RuleDef(
                    id="LAYER-DIRECTION-DOWNWARD",
                    type="layer_direction",
                    description="Upper layers may depend on lower layers, but lower layers must not depend on upper layers.",
                    severity="high",
                    layer_direction="downward_only"
                )
            ]

        for rule in layer_rules:
            direction = rule.layer_direction or "downward_only"
            for dep in dependencies:
                src_comp_name = self.graph.module_to_component.get(dep.source_module)
                tgt_comp_name = self.graph.module_to_component.get(dep.target_module)

                if not src_comp_name or not tgt_comp_name or src_comp_name == tgt_comp_name:
                    continue

                src_comp = self.graph.component_defs.get(src_comp_name)
                tgt_comp = self.graph.component_defs.get(tgt_comp_name)

                if not src_comp or not tgt_comp or src_comp.layer is None or tgt_comp.layer is None:
                    continue

                is_violation = False
                explanation = ""

                if direction == "downward_only":
                    # Lower layer number = higher/outer layer (e.g. 1=Presentation, 2=Application, 3=Domain, 4=Infrastructure)
                    # If Domain (3) imports Presentation (1), src.layer (3) > tgt.layer (1) -> upward dependency violation!
                    if src_comp.layer > tgt_comp.layer:
                        is_violation = True
                        explanation = f"Lower layer '{src_comp_name}' (Layer {src_comp.layer}) depends upward on higher layer '{tgt_comp_name}' (Layer {tgt_comp.layer})."
                elif direction == "adjacent_downward_only":
                    # Must be exactly src.layer + 1 == tgt.layer
                    if tgt_comp.layer < src_comp.layer or tgt_comp.layer > src_comp.layer + 1:
                        is_violation = True
                        explanation = f"Strict adjacent layer rule violated: '{src_comp_name}' (Layer {src_comp.layer}) cannot depend on '{tgt_comp_name}' (Layer {tgt_comp.layer})."

                if is_violation:
                    self.violated_rule_ids.add(rule.id)
                    mod_info = self.graph.module_graph.nodes.get(dep.source_module, {})
                    file_path = mod_info.get("file_path", "")

                    self.findings.append(
                        FindingDraft(
                            rule_id=rule.id,
                            rule_type="layer_violation",
                            title=f"Layer Violation: '{src_comp_name}' (L{src_comp.layer}) -> '{tgt_comp_name}' (L{tgt_comp.layer})",
                            explanation=f"{explanation} Rule: {rule.description}",
                            severity=rule.severity,
                            source_module=dep.source_module,
                            target_module=dep.target_module,
                            source_component=src_comp_name,
                            target_component=tgt_comp_name,
                            file_path=file_path,
                            line_number=dep.line_number,
                            expected_behavior=f"Dependencies must follow {direction} hierarchy.",
                            actual_behavior=f"Detected upward or invalid layer dependency via '{dep.statement}' at line {dep.line_number}.",
                            evidence=f"{file_path}:{dep.line_number} -> {dep.statement}",
                            confidence="high",
                            remediation=f"Refactor '{dep.source_module}' to invert the dependency using an interface/protocol defined in '{src_comp_name}' and implemented in '{tgt_comp_name}'."
                        )
                    )

    def _check_unexpected_dependencies(self, dependencies: List[RawImport]):
        # Whitelist policy: if a component explicitly specifies allowed_dependencies, any dependency outside that is unexpected
        for comp in self.definition.components:
            if not comp.allowed_dependencies:
                continue

            allowed_set = set(comp.allowed_dependencies)
            allowed_set.add(comp.name) # self-dependency allowed

            for dep in dependencies:
                src_comp = self.graph.module_to_component.get(dep.source_module)
                tgt_comp = self.graph.module_to_component.get(dep.target_module)

                if src_comp == comp.name and tgt_comp and tgt_comp not in allowed_set:
                    rule_id = f"RULE-UNEXPECTED-{comp.name.upper()}-TO-{tgt_comp.upper()}"
                    self.violated_rule_ids.add(rule_id)
                    mod_info = self.graph.module_graph.nodes.get(dep.source_module, {})
                    file_path = mod_info.get("file_path", "")

                    self.findings.append(
                        FindingDraft(
                            rule_id=rule_id,
                            rule_type="unexpected_dependency",
                            title=f"Unexpected Dependency: '{src_comp}' -> '{tgt_comp}'",
                            explanation=f"Component '{src_comp}' depends on '{tgt_comp}', which is not listed in its allowed dependencies ({comp.allowed_dependencies}).",
                            severity="medium",
                            source_module=dep.source_module,
                            target_module=dep.target_module,
                            source_component=src_comp,
                            target_component=tgt_comp,
                            file_path=file_path,
                            line_number=dep.line_number,
                            expected_behavior=f"Component '{src_comp}' may only depend on: {', '.join(comp.allowed_dependencies)}.",
                            actual_behavior=f"Observed unexpected dependency to '{tgt_comp}' via '{dep.statement}'.",
                            evidence=f"{file_path}:{dep.line_number} -> {dep.statement}",
                            confidence="high",
                            remediation=f"Check if this dependency is justified. If so, add '{tgt_comp}' to allowed_dependencies for '{src_comp}' in the architecture definition; otherwise refactor."
                        )
                    )

    def _check_missing_required_dependencies(self):
        for comp in self.definition.components:
            for required_target in comp.required_dependencies:
                # Check if an edge exists in component graph from comp.name to required_target
                has_edge = self.graph.component_graph.has_edge(comp.name, required_target)
                if not has_edge:
                    rule_id = f"RULE-REQUIRED-{comp.name.upper()}-TO-{required_target.upper()}"
                    self.violated_rule_ids.add(rule_id)
                    self.findings.append(
                        FindingDraft(
                            rule_id=rule_id,
                            rule_type="missing_dependency",
                            title=f"Missing Required Dependency: '{comp.name}' -> '{required_target}'",
                            explanation=f"Architecture specifies that '{comp.name}' must depend on '{required_target}', but no dependencies were observed.",
                            severity="medium",
                            source_component=comp.name,
                            target_component=required_target,
                            expected_behavior=f"Component '{comp.name}' must integrate with '{required_target}'.",
                            actual_behavior=f"Zero dependencies found from '{comp.name}' to '{required_target}'.",
                            evidence=f"Component graph has no edge between '{comp.name}' and '{required_target}'.",
                            confidence="high",
                            remediation=f"Implement the expected integration between '{comp.name}' and '{required_target}'."
                        )
                    )

    def _check_circular_dependencies(self):
        rule_id = "CORE-CIRCULAR-DEPENDENCY"
        severity = "critical"
        for r in self.definition.rules:
            if r.type == "circular_dependency":
                rule_id = r.id
                severity = r.severity
                break

        # Check component-level cycles
        comp_cycles = self.graph.find_component_cycles()
        for cycle in comp_cycles:
            cycle_str = " -> ".join(cycle + [cycle[0]])
            self.violated_rule_ids.add(f"{rule_id}:{cycle_str}")
            self.findings.append(
                FindingDraft(
                    rule_id=rule_id,
                    rule_type="circular_dependency",
                    title=f"Circular Component Dependency: {cycle_str}",
                    explanation=f"A circular dependency cycle was detected between components: {cycle_str}. Cycles create tight coupling and prevent clean modular testing and deployment.",
                    severity=severity,
                    source_component=cycle[0],
                    target_component=cycle[1] if len(cycle) > 1 else cycle[0],
                    expected_behavior="Architecture graph must be a Directed Acyclic Graph (DAG) with no cycles.",
                    actual_behavior=f"Cycle observed: {cycle_str}",
                    evidence=f"Cycle path: {cycle_str}",
                    confidence="high",
                    remediation=f"Break the cycle along {cycle_str} using the Dependency Inversion Principle, events, or splitting shared logic into a common domain/utility module."
                )
            )

        # Check module-level cycles if no component cycles or in addition
        mod_cycles = self.graph.find_module_cycles()
        for cycle in mod_cycles[:5]: # Cap at 5 module cycles to prevent overwhelming
            cycle_str = " -> ".join(cycle + [cycle[0]])
            self.violated_rule_ids.add(f"{rule_id}-MOD:{cycle_str}")
            self.findings.append(
                FindingDraft(
                    rule_id=f"{rule_id}-MODULE",
                    rule_type="circular_dependency",
                    title=f"Circular Module Dependency: {cycle_str}",
                    explanation=f"A circular dependency cycle was detected between modules: {cycle_str}.",
                    severity="high",
                    source_module=cycle[0],
                    target_module=cycle[1] if len(cycle) > 1 else cycle[0],
                    expected_behavior="Module dependencies should not form closed loops.",
                    actual_behavior=f"Module cycle observed: {cycle_str}",
                    evidence=f"Cycle: {cycle_str}",
                    confidence="high",
                    remediation=f"Extract shared types or functions from {cycle[0]} and {cycle[-1]} into a separate module."
                )
            )

    def _check_adr_violations(self, dependencies: List[RawImport]):
        adr_rules = [r for r in self.definition.rules if r.type == "adr_violation"]
        for rule in adr_rules:
            # Check configured parameters in rule.config
            prohibited_imports = rule.config.get("prohibited_imports", [])
            target_component = rule.config.get("target_component")
            
            for dep in dependencies:
                src_comp = self.graph.module_to_component.get(dep.source_module)
                
                # If target_component specified, only apply to that component
                if target_component and src_comp != target_component:
                    continue

                for prohibited in prohibited_imports:
                    if prohibited.lower() in dep.statement.lower() or prohibited.lower() in dep.target_module.lower():
                        self.violated_rule_ids.add(rule.id)
                        mod_info = self.graph.module_graph.nodes.get(dep.source_module, {})
                        file_path = mod_info.get("file_path", "")

                        self.findings.append(
                            FindingDraft(
                                rule_id=rule.id,
                                rule_type="adr_violation",
                                title=f"Architecture Decision Violation: {rule.description}",
                                explanation=f"Module '{dep.source_module}' in '{src_comp}' violates ADR '{rule.id}'. Prohibited import '{prohibited}' was used.",
                                severity=rule.severity,
                                source_module=dep.source_module,
                                source_component=src_comp,
                                file_path=file_path,
                                line_number=dep.line_number,
                                expected_behavior=f"Rule requirement: {rule.description}",
                                actual_behavior=f"Prohibited import detected: '{dep.statement}' at line {dep.line_number}.",
                                evidence=f"{file_path}:{dep.line_number} -> {dep.statement}",
                                confidence="high",
                                remediation=f"Remove prohibited dependency '{prohibited}' from '{dep.source_module}' according to architecture decision record."
                            )
                        )
