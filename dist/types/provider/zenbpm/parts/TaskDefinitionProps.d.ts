/**
 * A Message Intermediate Throw Event is executed by the engine as a job, the
 * same way as a Send Task, so it is configured via zenbpm:TaskDefinition
 * rather than via a referenced bpmn:Message.
 */
export declare function isMessageThrowEvent(element: any): boolean;
export declare function isServiceTaskLike(element: any): boolean;
declare function TypeEntry(props: any): any;
export declare function TaskDefinitionProps(element: any): {
    id: string;
    component: typeof TypeEntry;
    isEdited: import("@bpmn-io/properties-panel").IsEditedFn;
}[];
export {};
