/**
 * Property-name convention for Camunda/ZenBPM Modeler UI metadata.
 *
 * Camunda Modeler stores UI-only metadata on BPMN elements via
 * `zeebe:Property` extension elements whose `name` carries a `camundaModeler:`
 * prefix (e.g. `name="camundaModeler:exampleOutputJson"`). The value of such
 * a property is conventionally a JSON blob. We normalise the prefix to
 * `zenbpmModeler:` on import (see `NormalizeNamespace.normalizeZeebeXml`) and
 * use this matcher to decide which extension properties should be edited
 * with JSON validation in the properties panel.
 *
 * The match is intentionally permissive on the vendor prefix so that other
 * `*Modeler:`-flavoured names (e.g. future `bpmnIoModeler:`) can opt in
 * without changing this code.
 */
const MODELER_PROPERTY_NAME_PATTERN = /^[a-zA-Z]+Modeler:/;

/**
 * Returns `true` if `name` follows the `<vendor>Modeler:` convention for
 * Modeler-side metadata, e.g. `camundaModeler:foo`, `zenbpmModeler:foo`.
 */
export function isModelerPropertyName(name: string | null | undefined): boolean {
  if (!name) return false;
  return MODELER_PROPERTY_NAME_PATTERN.test(name);
}

/**
 * Validate a string as JSON. Suitable for use as a `validate` prop on a
 * bpmn-io `TextFieldEntry` / `TextAreaEntry` — returns `null` when the value
 * is acceptable (empty *or* parseable JSON) and a human-readable error
 * string otherwise.
 */
export function validateJson(value: string | null | undefined): string | null {
  if (value == null || value.trim() === '') {
    return null;
  }
  try {
    JSON.parse(value);
    return null;
  } catch (err: any) {
    return `Value must be valid JSON (${err && err.message ? err.message : 'parse error'})`;
  }
}
