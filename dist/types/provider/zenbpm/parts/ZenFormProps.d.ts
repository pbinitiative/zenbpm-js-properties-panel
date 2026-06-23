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
export declare function setupFormSaveHandler(injector: any): void;
export {};
