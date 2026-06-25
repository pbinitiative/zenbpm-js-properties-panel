/**
 * Reserved target name used by the form designer. The matching
 * `zenbpm:Input` is auto-created / auto-updated by `setupFormSaveHandler`
 * and is system-managed — the modeller should not see it in the
 * user-editable input mapping list.
 */
export declare const ZEN_FORM = "ZEN_FORM";
export declare function ZenFormProps(element: any): {
    id: string;
    component: typeof ZenFormDesignButtonEntry;
    isEdited: () => boolean;
}[];
declare function ZenFormDesignButtonEntry(props: any): any;
/**
 * Form field keys currently defined in the element's ZEN_FORM schema.
 * Used by the Output mapping group to badge rows auto-created from a
 * form field. Returns [] when there is no form / an unparsable form.
 */
export declare function getFormFieldKeys(element: any): string[];
/** Test-only: reset the per-element dedup guard. Not public API. */
export declare function __resetFormSyncCacheForTesting(): void;
export declare function setupFormSaveHandler(injector: any): void;
export {};
