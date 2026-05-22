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
