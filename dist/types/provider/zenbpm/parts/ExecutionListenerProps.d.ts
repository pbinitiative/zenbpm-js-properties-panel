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
 * The engine runs an execution listener only on a start event directly under
 * `<process>` and refuses one anywhere else at deployment, a start event of an
 * embedded or event sub-process included. In a collaboration the start event's
 * parent is still the participant's process.
 */
export declare function canHaveExecutionListener(element: any): boolean;
/** Every execution listener of the element, whatever its event type. */
export declare function getListeners(bo: any): any[];
/**
 * Why the engine refuses to deploy the listener where it sits, or null. A
 * listener the panel would not create is still shown with this reason, so that
 * one imported or moved there can be seen and removed.
 */
export declare function validateListenerPlacement(element: any, listeners: any[], eventType: string | undefined): ValidationMessage | null;
export declare function validateListenerType(value: string | undefined): ValidationMessage | null;
export declare function validateListenerRetries(value: string | undefined): ValidationMessage | null;
export declare const EXECUTION_LISTENER_GROUP_ID = "zenbpm-executionListener";
/**
 * The Execution listener group: offered on a start event directly under the
 * process, where a listener can be created while there is none, and shown on
 * any element that has listeners, so that one the engine refuses there can be
 * removed. Null when neither applies.
 */
export declare function createExecutionListenerGroup(element: any, injector: any): any | null;
