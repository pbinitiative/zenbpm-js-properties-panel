/**
 * Normalise a raw stored value for display inside a `FeelEntry` with
 * `feel: 'required'`.
 *
 * `FeelEntry` expects values to carry the `=` prefix that marks them as FEEL
 * expressions (e.g. `=myVariable`, `=[1,2,3]`).  Older data saved without
 * the prefix is transparently upgraded on read so the editor shows it
 * correctly, and the next save will persist the `=`.
 *
 * @example
 *   // In a FeelEntry getValue:
 *   const getValue = () => getFeelValue(param.source);
 */
export declare function getFeelValue(stored: string | undefined): string;
/**
 * Read the FEEL body from a `bpmn:FormalExpression` element.
 * Returns an empty string when the expression does not exist yet.
 */
export declare function getFormalExpressionValue(expression: any): string;
/**
 * Create, update, or remove a `bpmn:FormalExpression` child property.
 *
 * - When `value` is empty the property is cleared (`undefined`).
 * - When the expression already exists its `body` is updated in-place.
 * - Otherwise a new `bpmn:FormalExpression` is created and attached.
 *
 * @param element        The diagram element (needed by the command stack).
 * @param moddleElement  The parent moddle object that owns the expression.
 * @param prop           Property name on `moddleElement` (e.g. `'conditionExpression'`).
 * @param value          New FEEL body value coming from `FeelEntry`.
 * @param bpmnFactory    Injected bpmn factory.
 * @param commandStack   Injected command stack.
 */
export declare function setFormalExpression(element: any, moddleElement: any, prop: string, value: string, bpmnFactory: any, commandStack: any): void;
