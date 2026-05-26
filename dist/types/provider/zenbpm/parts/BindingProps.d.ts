import { isSelectEntryEdited, isTextFieldEntryEdited } from '@bpmn-io/properties-panel';
export declare const BINDING_OPTIONS: {
    value: string;
    label: string;
}[];
export { isSelectEntryEdited, isTextFieldEntryEdited };
export declare function makeBindingTypeEntry(idPrefix: string, extensionType: string): (props: any) => any;
export declare function makeVersionTagEntry(idPrefix: string, extensionType: string): (props: any) => any;
export declare function bindingEntries(idPrefix: string, bindingTypeComponent: (props: any) => any, versionTagComponent: (props: any) => any, element: any, extensionType: string): any[];
