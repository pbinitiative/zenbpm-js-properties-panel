/**
 * The Execution listeners group: offered where the engine runs listeners,
 * where one more listener can always be created behind the ones there, and
 * shown on any element that has listeners, so that one the engine does not
 * run there can be removed. Null when neither applies.
 */
export declare function createExecutionListenerGroup(element: any, injector: any): any | null;
/**
 * Whether a listener can run depends on the outgoing sequence flows of its
 * element. The modeler reports a drawn, removed or reconnected flow as a
 * change of the flow alone, also when the change is undone or redone, so the
 * panel would keep showing what held before for the element it has open. This
 * reports the elements such a flow left or leaves as changed as well. Another
 * connection, such as a message flow or an association, says nothing about a
 * listener, so its ends are left alone.
 */
export declare function reportSourcesOfChangedSequenceFlows(injector: any): void;
