/**
 * Returns `true` if `name` follows the `<vendor>Modeler:` convention for
 * Modeler-side metadata, e.g. `camundaModeler:foo`, `zenbpmModeler:foo`.
 */
export declare function isModelerPropertyName(name: string | null | undefined): boolean;
/**
 * Validate a string as JSON. Suitable for use as a `validate` prop on a
 * bpmn-io `TextFieldEntry` / `TextAreaEntry` — returns `null` when the value
 * is acceptable (empty *or* parseable JSON) and a human-readable error
 * string otherwise.
 */
export declare function validateJson(value: string | null | undefined): string | null;
