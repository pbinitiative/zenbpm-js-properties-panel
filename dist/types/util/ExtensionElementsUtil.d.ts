/**
 * Return the first extension element of `type` from the given business object,
 * or undefined if none exists.
 */
export declare function getExtensionElement(bo: any, type: string): any;
/**
 * Answer the `bpmn:ExtensionElements` of `bo`. When it is missing, push the
 * command creating it onto `commands` for one
 * `properties-panel.multi-command-executor` step, and answer the new one,
 * which a later command of the same step can update.
 */
export declare function ensureExtensionElements(element: any, bo: any, bpmnFactory: any, commands: any[]): any;
/**
 * Answer the extension element of `type` of `bo`. When it is missing, push
 * the commands creating it with `props`, and `bpmn:ExtensionElements` too
 * where that is missing, onto `commands` for one
 * `properties-panel.multi-command-executor` step, and answer the new element,
 * which a later command of the same step can update.
 */
export declare function ensureExtensionElement(element: any, bo: any, type: string, bpmnFactory: any, commands: any[], props?: Record<string, any>): any;
/**
 * Update properties on an existing extension element, or create a new one
 * inside bpmn:ExtensionElements if it does not yet exist.
 *
 * Uses `properties-panel.multi-command-executor` so all mutations land as
 * a single undo-able step.
 */
export declare function updateExtensionElementProps(element: any, bo: any, type: string, props: Record<string, any>, bpmnFactory: any, commandStack: any): void;
/**
 * Remove all extension elements of `type` from `bo`. No-op if none exist.
 * Executes a single undoable command.
 */
export declare function removeExtensionElement(element: any, bo: any, type: string, commandStack: any): void;
/**
 * Remove one extension element of `bo` and leave every other one, those of
 * its own type included. No-op if `bo` does not carry it. Executes a single
 * undoable command.
 */
export declare function removeExtensionValue(element: any, bo: any, value: any, commandStack: any): void;
/**
 * Atomically swap extension elements: remove all instances of `removeType` and
 * ensure exactly one instance of `createType` exists.  Both changes land as a
 * single undoable step via `properties-panel.multi-command-executor`.
 *
 * Used when toggling mutually-exclusive extension elements (e.g. switching a
 * BusinessRuleTask between a CalledDecision and a TaskDefinition).
 */
export declare function switchExtensionElement(element: any, bo: any, removeType: string, createType: string, bpmnFactory: any, commandStack: any): void;
