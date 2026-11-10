import {
  ListGroup,
  SelectEntry,
  TextFieldEntry,
  isSelectEntryEdited,
  isTextFieldEntryEdited,
} from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import {
  ensureExtensionElement,
  getExtensionElement,
  removeExtensionElement,
} from '../../../util/ExtensionElementsUtil';

const CONTAINER_TYPE = 'zenbpm:ExecutionListeners';
const LISTENER_TYPE = 'zenbpm:ExecutionListener';

// The one event type the engine runs: on a start event, the listener's job is
// created when a token reaches the event, and the token leaves it once the job
// is completed.
const END_EVENT_TYPE = 'end';

const MAX_INT32 = 2147483647;

/**
 * A validation message as a translation template with its replacements, so
 * that a host's translate service can translate the message as it translates
 * labels.
 */
export interface ValidationMessage {
  template: string;
  replacements?: Record<string, string | number>;
}

/**
 * The engine runs an execution listener only on a start event directly under
 * `<process>` and refuses one anywhere else at deployment, a start event of an
 * embedded or event sub-process included. In a collaboration the start event's
 * parent is still the participant's process.
 */
export function canHaveExecutionListener(element: any): boolean {
  const bo = element.businessObject;
  return element.type === 'bpmn:StartEvent' && !!bo?.$parent && bo.$parent.$type === 'bpmn:Process';
}

/** Every execution listener of the element, whatever its event type. */
export function getListeners(bo: any): any[] {
  return getExtensionElement(bo, CONTAINER_TYPE)?.listeners || [];
}

/**
 * The engine takes `type`, `retries` and `retryBackoff` of a listener as
 * literals only, so that creating its job can never fail on an expression.
 */
function isExpression(value: string): boolean {
  return value.trim().startsWith('=');
}

/**
 * Why the engine refuses to deploy the listener where it sits, or null. A
 * listener the panel would not create is still shown with this reason, so that
 * one imported or moved there can be seen and removed.
 */
export function validateListenerPlacement(
  element: any,
  listeners: any[],
  eventType: string | undefined,
): ValidationMessage | null {
  if (!canHaveExecutionListener(element)) {
    return { template: 'Remove this listener: the engine runs a listener only on a start event directly under the process' };
  }
  if (listeners.length > 1) {
    return { template: 'Remove all listeners but one: the engine runs one listener on a start event' };
  }
  if (eventType !== END_EVENT_TYPE) {
    return { template: 'Choose End: the engine runs only an end listener on a start event' };
  }
  return null;
}

export function validateListenerType(value: string | undefined): ValidationMessage | null {
  if (!value || value.trim() === '') {
    return { template: 'Enter the job type of the listener' };
  }
  if (isExpression(value)) {
    return { template: 'Enter the job type as a literal: a listener takes no FEEL expression' };
  }
  return null;
}

export function validateListenerRetries(value: string | undefined): ValidationMessage | null {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') return null;
  if (isExpression(trimmed)) {
    return { template: 'Enter the retries as a literal: a listener takes no FEEL expression' };
  }
  if (!/^\d+$/.test(trimmed) || Number(trimmed) > MAX_INT32) {
    return { template: 'Enter a whole number from 0 to {max}', replacements: { max: MAX_INT32 } };
  }
  return null;
}

function translated(translate: any, message: ValidationMessage | null): string | null {
  return message ? translate(message.template, message.replacements) : null;
}

// ─── commands ────────────────────────────────────────────────────────────────

/**
 * Give the element an `end` listener without a job type yet, creating the
 * extension elements and the listeners container where they are missing, in
 * one undoable step.
 */
function addEndListener(element: any, bpmnFactory: any, commandStack: any): void {
  const commands: any[] = [];
  const container = ensureExtensionElement(
    element, element.businessObject, CONTAINER_TYPE, bpmnFactory, commands, { listeners: [] },
  );

  const listener = bpmnFactory.create(LISTENER_TYPE, { eventType: END_EVENT_TYPE });
  listener.$parent = container;
  commands.push({
    cmd: 'element.updateModdleProperties',
    context: {
      element,
      moddleElement: container,
      properties: { listeners: [...(container.listeners || []), listener] },
    },
  });

  commandStack.execute('properties-panel.multi-command-executor', commands);
}

/**
 * Remove one listener. A container left without listeners is removed as well,
 * so that no empty `executionListeners` stays in the XML.
 */
function removeListener(element: any, listener: any, commandStack: any): void {
  const bo = element.businessObject;
  const container = getExtensionElement(bo, CONTAINER_TYPE);
  if (!container) return;

  const remaining = (container.listeners || []).filter((value: any) => value !== listener);
  if (remaining.length === 0) {
    removeExtensionElement(element, bo, CONTAINER_TYPE, commandStack);
    return;
  }
  commandStack.execute('element.updateModdleProperties', {
    element,
    moddleElement: container,
    properties: { listeners: remaining },
  });
}

function updateListener(element: any, listener: any, properties: Record<string, any>, commandStack: any): void {
  commandStack.execute('element.updateModdleProperties', { element, moddleElement: listener, properties });
}

// ─── entry components ────────────────────────────────────────────────────────
// Defined at module scope, so that their function references never change and
// Preact does not remount an input while the user types in it.

function EventTypeEntry(props: any) {
  const { element, id, listener, listeners } = props;
  const commandStack = useService('commandStack');
  const translate    = useService('translate');

  // A listener of another event type, imported from another engine's model,
  // keeps its value as an option, so that the field shows what is there.
  const getOptions = () => {
    const options = [ { value: END_EVENT_TYPE, label: translate('End') } ];
    if (listener.eventType !== END_EVENT_TYPE) {
      options.push({ value: listener.eventType ?? '', label: listener.eventType || translate('<none>') });
    }
    return options;
  };

  return SelectEntry({
    element,
    id,
    label: translate('Event type'),
    getValue: () => listener.eventType ?? '',
    setValue: (value: string) => updateListener(element, listener, { eventType: value || undefined }, commandStack),
    getOptions,
    validate: (value: string) => translated(translate, validateListenerPlacement(element, listeners, value)),
  });
}

function TypeEntry(props: any) {
  const { element, id, listener } = props;
  const commandStack = useService('commandStack');
  const translate    = useService('translate');
  const debounce     = useService('debounceInput');

  // Clearing the type keeps the listener with its other attributes, so that
  // typing a new type afterwards loses nothing; the listener is removed with
  // the delete button of its list item.
  return TextFieldEntry({
    element,
    id,
    label: translate('Type'),
    description: translate('Job type of the listener. A worker completes the job before the token leaves the start event.'),
    getValue: () => listener.type,
    setValue: (value: string | undefined) => updateListener(element, listener, { type: value || undefined }, commandStack),
    validate: (value: string) => translated(translate, validateListenerType(value)),
    debounce,
  });
}

function RetriesEntry(props: any) {
  const { element, id, listener } = props;
  const commandStack = useService('commandStack');
  const translate    = useService('translate');
  const debounce     = useService('debounceInput');

  return TextFieldEntry({
    element,
    id,
    label: translate('Retries'),
    description: translate('Optional; the engine default when empty.'),
    getValue: () => listener.retries,
    setValue: (value: string | undefined) =>
      updateListener(element, listener, { retries: value && value.trim() !== '' ? value : undefined }, commandStack),
    validate: (value: string) => translated(translate, validateListenerRetries(value)),
    debounce,
  });
}

// ─── group ───────────────────────────────────────────────────────────────────

export const EXECUTION_LISTENER_GROUP_ID = 'zenbpm-executionListener';

/**
 * The Execution listener group: offered on a start event directly under the
 * process, where a listener can be created while there is none, and shown on
 * any element that has listeners, so that one the engine refuses there can be
 * removed. Null when neither applies.
 */
export function createExecutionListenerGroup(element: any, injector: any): any | null {
  const listeners = getListeners(element.businessObject);
  const canHave = canHaveExecutionListener(element);
  if (!canHave && listeners.length === 0) return null;

  const commandStack = injector.get('commandStack');
  const bpmnFactory  = injector.get('bpmnFactory');
  const translate    = injector.get('translate');
  const eventBus     = injector.get('eventBus');

  const itemId = (index: number) => `${element.id}-zenbpm-executionListener-${index}`;

  const items = listeners.map((listener: any, index: number) => {
    const id = itemId(index);
    return {
      id,
      label: listener.type || translate('<empty>'),
      entries: [
        // extras such as `listener` are spread into the component's props by CollapsibleEntry
        { id: `${id}-eventType`, component: EventTypeEntry, isEdited: isSelectEntryEdited, listener, listeners },
        { id: `${id}-type`, component: TypeEntry, isEdited: isTextFieldEntryEdited, listener },
        { id: `${id}-retries`, component: RetriesEntry, isEdited: isTextFieldEntryEdited, listener },
      ],
      autoFocusEntry: `${id}-type`,
      remove: () => removeListener(element, listener, commandStack),
    };
  });

  // The engine runs one listener on a start event, so none is offered next to one.
  const add = canHave && listeners.length === 0
    ? () => {
      addEndListener(element, bpmnFactory, commandStack);
      setTimeout(() => eventBus.fire('propertiesPanel.showEntry', { id: `${itemId(0)}-type` }), 0);
    }
    : undefined;

  return {
    id: EXECUTION_LISTENER_GROUP_ID,
    label: translate('Execution listener'),
    component: ListGroup,
    items,
    add,
  };
}
