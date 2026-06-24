/**
 * Read the `zenbpm:PriorityDefinition` extension element of the given element,
 * or `undefined` if none exists.
 */
export declare function getPriorityDefinition(element: any): any;
export declare function AssignmentDefinitionProps(element: any): {
    id: string;
    component: (props: any) => any;
    isEdited: import("@bpmn-io/properties-panel").IsEditedFn;
}[];
