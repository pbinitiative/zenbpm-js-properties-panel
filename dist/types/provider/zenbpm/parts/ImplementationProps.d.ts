/**
 * Infer the current implementation type from extension elements:
 * - zenbpm:TaskDefinition present  → 'jobWorker'
 * - otherwise (zenbpm:CalledDecision or nothing) → 'dmnDecision'
 */
export declare function getImplementationType(element: any): 'dmnDecision' | 'jobWorker';
declare function ImplementationEntry(props: any): any;
export declare function ImplementationProps(_element: any): {
    id: string;
    component: typeof ImplementationEntry;
    isEdited: import("@bpmn-io/properties-panel").IsEditedFn;
}[];
export {};
