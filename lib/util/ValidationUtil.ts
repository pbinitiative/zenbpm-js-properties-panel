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

/**
 * A validation message as a translation template with its replacements, so
 * that a host's translate service can translate the message as it translates
 * labels.
 */
export interface ValidationMessage {
  template: string;
  replacements?: Record<string, string | number>;
}

const MAX_INT32 = 2147483647;
const MAX_INT64 = '9223372036854775807';

/**
 * Validate retries written as a literal. The engine reads them as a decimal
 * integer with an optional sign, and takes none below zero or above what 32
 * bits hold.
 */
export function validateRetriesLiteral(value: string): ValidationMessage | null {
  const trimmed = value.trim();
  if (!/^[+-]?\d+$/.test(trimmed) || Number(trimmed) < 0 || Number(trimmed) > MAX_INT32) {
    return { template: 'Enter a whole number from 0 to {max}', replacements: { max: MAX_INT32 } };
  }
  return null;
}

// One duration of a retry backoff as the engine reads it: whole numbers, the
// units in this order, the time units behind a `T`. Years and months parse,
// so that they can be refused with a reason of their own.
const BACKOFF_DURATION = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:\d+W)?(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+S)?)?$/;

/** Whether the engine can read the digits as a number, which it holds in 64 bits. */
function fitsInto64Bits(digits: string): boolean {
  const significant = digits.replace(/^0+/, '');
  return significant.length < MAX_INT64.length || (significant.length === MAX_INT64.length && significant <= MAX_INT64);
}

/**
 * Validate a retry backoff written as a literal. The engine reads it as one
 * ISO-8601 duration or several separated by commas, one for each failure,
 * and refuses a deployment with one it cannot read.
 */
export function validateRetryBackoffLiteral(value: string): ValidationMessage | null {
  for (const entry of value.split(',')) {
    const duration = entry.trim();
    const parts = BACKOFF_DURATION.exec(duration);
    if (!parts || duration === 'P' || duration.endsWith('T')) {
      return { template: 'Enter an ISO-8601 duration such as PT10S, or several separated by commas' };
    }
    if (!(duration.match(/\d+/g) ?? []).every(fitsInto64Bits)) {
      return { template: 'Enter smaller numbers: the engine reads none above {max}', replacements: { max: MAX_INT64 } };
    }
    if (Number(parts[1] ?? 0) !== 0 || Number(parts[2] ?? 0) !== 0) {
      return { template: 'Enter the retry backoff in weeks, days, hours, minutes or seconds: the length of a year or a month depends on the date' };
    }
  }
  return null;
}
