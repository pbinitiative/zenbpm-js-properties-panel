declare const START_EVENT_TYPE = "start";
declare const END_EVENT_TYPE = "end";
export type ListenerEventType = typeof START_EVENT_TYPE | typeof END_EVENT_TYPE;
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
 * The event types of the listeners the engine runs on the element, and none
 * where it runs no listener. This is the one table the panel follows, as the
 * engine follows one: `start` and `end` on an element whose own work is one
 * job (a service, send or user task, a business rule task done by a job
 * worker, a message intermediate throw event), none of them where the
 * activity is multi-instance, and `end` on a start event directly under the
 * process. The engine refuses a listener anywhere else at deployment, and
 * ignores one on the process itself.
 */
export declare function listenerEventTypesRunOn(element: any): ListenerEventType[];
/** Every execution listener of the element, whatever its event type. */
export declare function getListeners(bo: any): any[];
/**
 * Why the engine does not run the listener where it sits, or null, in the
 * order the engine checks it. A listener the panel would not create is still
 * shown with this reason, so that one imported or moved there can be seen and
 * removed.
 */
export declare function validateListenerPlacement(element: any, eventType: string | undefined): ValidationMessage | null;
export declare function validateListenerType(value: string | undefined, listener?: any, listeners?: any[]): ValidationMessage | null;
export declare function validateListenerRetries(value: string | undefined): ValidationMessage | null;
export declare const EXECUTION_LISTENER_GROUP_ID = "zenbpm-executionListener";
/**
 * The Execution listeners group: offered where the engine runs listeners,
 * where one more listener can always be created behind the ones there, and
 * shown on any element that has listeners, so that one the engine does not
 * run there can be removed. Null when neither applies.
 */
export declare function createExecutionListenerGroup(element: any, injector: any): any | null;
export {};
