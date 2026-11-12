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
import { getImplementationType } from './ImplementationProps';
import { getMultiInstanceLoopCharacteristics } from './MultiInstanceProps';
import { isMessageThrowEvent } from './TaskDefinitionProps';

const CONTAINER_TYPE = 'zenbpm:ExecutionListeners';
const LISTENER_TYPE = 'zenbpm:ExecutionListener';

const START_EVENT_TYPE = 'start';
const END_EVENT_TYPE = 'end';

export type ListenerEventType = typeof START_EVENT_TYPE | typeof END_EVENT_TYPE;

// An element whose own work is one job runs listeners before that job
// (`start`) and after it (`end`).
const EVENT_TYPES_OF_A_JOB_ELEMENT: ListenerEventType[] = [ START_EVENT_TYPE, END_EVENT_TYPE ];

// A start event does no work a listener could run before, so it takes `end`
// listeners only: their jobs hold the token at the event.
const EVENT_TYPES_OF_A_START_EVENT: ListenerEventType[] = [ END_EVENT_TYPE ];

const TASKS_WHOSE_WORK_IS_ALWAYS_ONE_JOB = new Set([
  'bpmn:ServiceTask',
  'bpmn:SendTask',
  'bpmn:UserTask',
]);

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
 * The event types of the listeners the engine would run on the element if it
 * were no multi-instance activity, and none where it runs no listener.
 */
function listenerEventTypesOfTheElementAlone(element: any): ListenerEventType[] {
  if (element.type === 'bpmn:StartEvent') {
    // In a collaboration the start event's parent is still the participant's process.
    return element.businessObject?.$parent?.$type === 'bpmn:Process' ? EVENT_TYPES_OF_A_START_EVENT : [];
  }
  if (TASKS_WHOSE_WORK_IS_ALWAYS_ONE_JOB.has(element.type)) return EVENT_TYPES_OF_A_JOB_ELEMENT;
  if (element.type === 'bpmn:BusinessRuleTask' && getImplementationType(element) === 'jobWorker') {
    return EVENT_TYPES_OF_A_JOB_ELEMENT;
  }
  if (isMessageThrowEvent(element)) return EVENT_TYPES_OF_A_JOB_ELEMENT;
  return [];
}

/**
 * The event types of the listeners the engine runs on the element, and none
 * where it runs no listener. This is the one table the panel follows, as the
 * engine follows one: `start` and `end` on an element whose own work is one
 * job (a service, send or user task, a business rule task done by a job
 * worker, a message intermediate throw event), none of them where the
 * activity is multi-instance, and `end` on a start event directly under the
 * process. The engine refuses a listener anywhere else at deployment, and
 * ignores one on the process itself.
 */
export function listenerEventTypesRunOn(element: any): ListenerEventType[] {
  if (getMultiInstanceLoopCharacteristics(element)) return [];
  return listenerEventTypesOfTheElementAlone(element);
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

/** Why the engine runs no listener on the element, with what to do about it. */
function whyNoListenerRunsOn(element: any): ValidationMessage {
  if (element.type === 'bpmn:Process') {
    return { template: 'Remove this listener: the engine runs no listener on the process itself' };
  }
  if (listenerEventTypesOfTheElementAlone(element).length > 0) {
    return { template: 'Remove this listener or the multi-instance marker: the engine runs no listener on a multi-instance activity' };
  }
  if (element.type === 'bpmn:StartEvent') {
    return { template: 'Remove this listener: the engine runs a listener on a start event only directly under the process' };
  }
  if (element.type === 'bpmn:BusinessRuleTask') {
    return { template: 'Remove this listener or choose the Job worker implementation: the engine runs no listener on a business rule task which calls a decision' };
  }
  return { template: 'Remove this listener: the engine runs listeners only on service, send and user tasks, job worker business rule tasks, message throw events and start events of the process' };
}

/**
 * Why the engine does not run the listener where it sits, or null, in the
 * order the engine checks it. A listener the panel would not create is still
 * shown with this reason, so that one imported or moved there can be seen and
 * removed.
 */
export function validateListenerPlacement(element: any, eventType: string | undefined): ValidationMessage | null {
  const eventTypes = listenerEventTypesRunOn(element);
  if (eventTypes.length === 0) {
    return whyNoListenerRunsOn(element);
  }
  if (!eventTypes.includes(eventType as ListenerEventType)) {
    return eventTypes.includes(START_EVENT_TYPE)
      ? { template: 'Choose Start or End: the engine runs no listener of another event type' }
      : { template: 'Choose End: a start event takes only end listeners' };
  }
  // The engine follows the `outgoing` references of the element, which the
  // modeler keeps in step with its sequence flows.
  if ((element.businessObject.get('outgoing') || []).length === 0) {
    return { template: 'Connect an outgoing sequence flow: the token could not leave the element once the listener\'s job is completed' };
  }
  return null;
}

/**
 * Whether another listener of the element has the same event type and the
 * same job type. The engine compares the job types without surrounding
 * whitespace, which a worker could not tell apart.
 */
function sharesEventTypeAndType(listener: any, type: string, listeners: any[]): boolean {
  return listeners.some((other: any) =>
    other !== listener && other.eventType === listener.eventType && (other.type ?? '').trim() === type.trim()
  );
}

export function validateListenerType(
  value: string | undefined,
  listener?: any,
  listeners: any[] = [],
): ValidationMessage | null {
  if (!value || value.trim() === '') {
    return { template: 'Enter the job type of the listener' };
  }
  if (isExpression(value)) {
    return { template: 'Enter the job type as a literal: a listener takes no FEEL expression' };
  }
  if (listener && sharesEventTypeAndType(listener, value, listeners)) {
    return { template: 'Enter another job type: two listeners of one event type need different types' };
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

/** The event type as the panel words it; one of another engine keeps its own word. */
function eventTypeLabel(translate: any, eventType: string | undefined): string {
  if (eventType === START_EVENT_TYPE) return translate('Start');
  if (eventType === END_EVENT_TYPE) return translate('End');
  return eventType || translate('<none>');
}

// ─── commands ────────────────────────────────────────────────────────────────

/**
 * Give the element one more listener of the event type, behind the ones it
 * has and without a job type yet, creating the extension elements and the
 * listeners container where they are missing, in one undoable step.
 */
function addListener(element: any, eventType: ListenerEventType, bpmnFactory: any, commandStack: any): void {
  const commands: any[] = [];
  const container = ensureExtensionElement(
    element, element.businessObject, CONTAINER_TYPE, bpmnFactory, commands, { listeners: [] },
  );

  const listener = bpmnFactory.create(LISTENER_TYPE, { eventType });
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
  const { element, id, listener } = props;
  const commandStack = useService('commandStack');
  const translate    = useService('translate');

  // An event type the engine does not run on the element, such as one of
  // another engine's model, keeps its value as an option, so that the field
  // shows what is there.
  const getOptions = () => {
    const eventTypes: string[] = listenerEventTypesRunOn(element);
    const options = eventTypes.map((eventType) => ({ value: eventType, label: eventTypeLabel(translate, eventType) }));
    if (!eventTypes.includes(listener.eventType)) {
      options.push({ value: listener.eventType ?? '', label: eventTypeLabel(translate, listener.eventType) });
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
    validate: (value: string) => translated(translate, validateListenerPlacement(element, value)),
  });
}

/** When a worker completes the job of the listener, by its event type. */
function typeDescription(translate: any, eventType: string | undefined): string {
  if (eventType === START_EVENT_TYPE) {
    return translate('Job type of the listener. A worker completes the job before the element\'s own work starts.');
  }
  if (eventType === END_EVENT_TYPE) {
    return translate('Job type of the listener. A worker completes the job before the token leaves the element.');
  }
  return translate('Job type of the listener.');
}

function TypeEntry(props: any) {
  const { element, id, listener, listeners } = props;
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
    description: typeDescription(translate, listener.eventType),
    getValue: () => listener.type,
    setValue: (value: string | undefined) => updateListener(element, listener, { type: value || undefined }, commandStack),
    validate: (value: string) => translated(translate, validateListenerType(value, listener, listeners)),
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
 * The Execution listeners group: offered where the engine runs listeners,
 * where one more listener can always be created behind the ones there, and
 * shown on any element that has listeners, so that one the engine does not
 * run there can be removed. Null when neither applies.
 */
export function createExecutionListenerGroup(element: any, injector: any): any | null {
  const listeners = getListeners(element.businessObject);
  const eventTypes = listenerEventTypesRunOn(element);
  if (eventTypes.length === 0 && listeners.length === 0) return null;

  const commandStack = injector.get('commandStack');
  const bpmnFactory  = injector.get('bpmnFactory');
  const translate    = injector.get('translate');
  const eventBus     = injector.get('eventBus');

  const itemId = (index: number) => `${element.id}-zenbpm-executionListener-${index}`;

  const items = listeners.map((listener: any, index: number) => {
    const id = itemId(index);
    return {
      id,
      label: translate('{eventType}: {type}', {
        eventType: eventTypeLabel(translate, listener.eventType),
        type: listener.type || translate('<no type>'),
      }),
      entries: [
        // extras such as `listener` are spread into the component's props by CollapsibleEntry
        { id: `${id}-eventType`, component: EventTypeEntry, isEdited: isSelectEntryEdited, listener },
        { id: `${id}-type`, component: TypeEntry, isEdited: isTextFieldEntryEdited, listener, listeners },
        { id: `${id}-retries`, component: RetriesEntry, isEdited: isTextFieldEntryEdited, listener },
      ],
      autoFocusEntry: `${id}-type`,
      remove: () => removeListener(element, listener, commandStack),
    };
  });

  // The engine runs the listeners of one event type in the order of the model,
  // so a new one goes behind the others, with the first event type the element
  // takes: `start` on a task, `end` on a start event.
  const add = eventTypes.length > 0
    ? () => {
      addListener(element, eventTypes[0], bpmnFactory, commandStack);
      setTimeout(() => eventBus.fire('propertiesPanel.showEntry', { id: `${itemId(listeners.length)}-type` }), 0);
    }
    : undefined;

  return {
    id: EXECUTION_LISTENER_GROUP_ID,
    label: translate('Execution listeners'),
    component: ListGroup,
    items,
    add,
  };
}
