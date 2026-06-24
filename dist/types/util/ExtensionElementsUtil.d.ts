/**
 * Return the first extension element of `type` from the given business object,
 * or undefined if none exists.
 */
export declare function getExtensionElement(bo: any, type: string): any;
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
 * Atomically swap extension elements: remove all instances of `removeType` and
 * ensure exactly one instance of `createType` exists.  Both changes land as a
 * single undoable step via `properties-panel.multi-command-executor`.
 *
 * Used when toggling mutually-exclusive extension elements (e.g. switching a
 * BusinessRuleTask between a CalledDecision and a TaskDefinition).
 */
export declare function switchExtensionElement(element: any, bo: any, removeType: string, createType: string, bpmnFactory: any, commandStack: any): void;
