/**
 * The engine runs an execution listener only on a start event directly under
 * `<process>` and refuses one anywhere else at deployment, a start event of an
 * embedded or event sub-process included. In a collaboration the start event's
 * parent is still the participant's process.
 */
export declare function canHaveExecutionListener(element: any): boolean;
/** The `end` listener of the element, or undefined when it has none. */
export declare function getEndListener(bo: any): any;
export declare function validateListenerType(value: string | undefined): string | null;
export declare function validateListenerRetries(value: string | undefined): string | null;
export declare function ExecutionListenerProps(element: any): any[];
