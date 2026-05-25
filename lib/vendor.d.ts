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

  // Form-entry components
  export const TextFieldEntry: EntryComponent;
  export const ToggleSwitchEntry: EntryComponent;
  export const FeelEntry: EntryComponent;

  // Edit-state helpers
  export const isTextFieldEntryEdited: IsEditedFn;
  export const isToggleSwitchEntryEdited: IsEditedFn;
  export const isFeelEntryEdited: IsEditedFn;
}

// ─── @bpmn-io/properties-panel/preact ────────────────────────────────────────

declare module '@bpmn-io/properties-panel/preact' {
  export function createElement(
    type: string | ((...args: any[]) => any),
    props: Record<string, any> | null,
    ...children: any[]
  ): any;
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
