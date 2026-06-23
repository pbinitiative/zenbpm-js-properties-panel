/**
 * Returns `true` if `name` (a moddle `zenbpm:Property.name` value) is a
 * known example-data property. Used by `ExtensionPropertiesGroup` to hide
 * these properties from the generic Extension properties list.
 */
export declare function isExampleDataPropertyName(name: string | null | undefined): boolean;
export declare function ExampleDataProps(element: any): any[];
