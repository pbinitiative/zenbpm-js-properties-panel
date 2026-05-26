export declare const BINDING_OPTIONS: {
    value: string;
    label: string;
}[];
export declare function makeBindingTypeEntry(idPrefix: string, extensionType: string): (props: any) => any;
export declare function makeVersionTagEntry(idPrefix: string, extensionType: string): (props: any) => any;
/**
 * Returns the binding-type select entry plus, when the current binding is
 * 'versionTag', the version-tag text-field entry.
 */
export declare function makeBindingEntries(idPrefix: string, extensionType: string, element: any): any[];
