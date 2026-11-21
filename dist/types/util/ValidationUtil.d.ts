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
/**
 * A validation message as a translation template with its replacements, so
 * that a host's translate service can translate the message as it translates
 * labels.
 */
export interface ValidationMessage {
    template: string;
    replacements?: Record<string, string | number>;
}
/**
 * Validate retries written as a literal. The engine reads them as a decimal
 * integer with an optional sign, and takes none below zero or above what 32
 * bits hold.
 */
export declare function validateRetriesLiteral(value: string): ValidationMessage | null;
/**
 * Validate a retry backoff written as a literal. The engine reads it as one
 * ISO-8601 duration or several separated by commas, one for each failure,
 * and refuses a deployment with one it cannot read.
 */
export declare function validateRetryBackoffLiteral(value: string): ValidationMessage | null;
