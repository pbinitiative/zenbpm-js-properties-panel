/**
 * Return the bpmn:MultiInstanceLoopCharacteristics of an element, or null.
 */
export declare function getMultiInstanceLoopCharacteristics(element: any): any;
/**
 * FEEL expression — the collection to iterate over (e.g. `= items`)
 */
declare function InputCollectionEntry(props: any): any;
export declare function MultiInstanceProps(element: any): {
    id: string;
    component: typeof InputCollectionEntry;
    isEdited: import("@bpmn-io/properties-panel").IsEditedFn;
}[];
export {};
