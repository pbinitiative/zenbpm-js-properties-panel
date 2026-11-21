/**
 * Ambient type declarations for third-party packages that ship no .d.ts files.
 */

// ─── @bpmn-io/properties-panel ───────────────────────────────────────────────

declare module '@bpmn-io/properties-panel' {
  export type EntryComponent = (props: any) => any;
  export type IsEditedFn = (node: any) => boolean;

  export interface GroupDefinition {
    id: string;
    label?: string;
    entries: EntryDefinition[];
    component?: EntryComponent;
    [key: string]: any;
  }

  export interface EntryDefinition {
    id: string;
    component: EntryComponent;
    isEdited?: IsEditedFn | (() => boolean);
    [key: string]: any;
  }

  export interface ListGroupDefinition extends GroupDefinition {
    add?: (event: any) => void;
    items?: any[];
  }

  // Layout component constructors (used as `component:` values)
  export const Group: EntryComponent;
  export const ListGroup: EntryComponent;

  // The errors the panel knows of, by entry id: an entry shows the one of its
  // id, a list group marks itself where an item of it has one.
  export const ErrorsContext: {
    Provider: EntryComponent;
  };

  // Whether a group is open, and the like, which the panel keeps for every
  // element alike under a path such as `['groups', id, 'open']`.
  export function useLayoutState(path: (string | number)[], defaultValue?: any): [ any, (value: any) => void ];

  // Form-entry components
  export const TextFieldEntry: EntryComponent;
  export const TextAreaEntry: EntryComponent;
  export const CheckboxEntry: EntryComponent;
  export const ToggleSwitchEntry: EntryComponent;
  export const FeelEntry: EntryComponent;
  export const SelectEntry: EntryComponent;

  // Edit-state helpers
  export const isTextFieldEntryEdited: IsEditedFn;
  export const isTextAreaEntryEdited: IsEditedFn;
  export const isCheckboxEntryEdited: IsEditedFn;
  export const isToggleSwitchEntryEdited: IsEditedFn;
  export const isFeelEntryEdited: IsEditedFn;
  export const isSelectEntryEdited: IsEditedFn;
}

// ─── @bpmn-io/properties-panel/preact ────────────────────────────────────────

declare module '@bpmn-io/properties-panel/preact' {
  export function createElement(
    type: string | ((...args: any[]) => any),
    props: Record<string, any> | null,
    ...children: any[]
  ): any;
}

// ─── @bpmn-io/properties-panel/preact/hooks ──────────────────────────────────

declare module '@bpmn-io/properties-panel/preact/hooks' {
  export function useContext(context: any): any;
  export function useEffect(effect: () => void | (() => void), inputs?: readonly any[]): void;
}

// ─── bpmn-js-properties-panel ────────────────────────────────────────────────

declare module 'bpmn-js-properties-panel' {
  /**
   * Hook-style service locator. Returns the named bpmn-js service.
   * Common service names: 'commandStack', 'bpmnFactory', 'translate',
   * 'debounceInput', 'modeling', 'eventBus', 'elementRegistry'
   */
  export function useService(name: string): any;
}
