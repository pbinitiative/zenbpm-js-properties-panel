import {
  ErrorsContext,
  ListGroup,
  SelectEntry,
  TextFieldEntry,
  isSelectEntryEdited,
  isTextFieldEntryEdited,
} from '@bpmn-io/properties-panel';
import { createElement } from '@bpmn-io/properties-panel/preact';
import { useContext } from '@bpmn-io/properties-panel/preact/hooks';
import { useService } from 'bpmn-js-properties-panel';
import {
  ensureExtensionElements,
  getExtensionElement,
  removeExtensionValue,
} from '../../../util/ExtensionElementsUtil';
import { getMultiInstanceLoopCharacteristics } from './MultiInstanceProps';
import { isMessageThrowEvent } from './TaskDefinitionProps';

const CONTAINER_TYPE = 'zenbpm:ExecutionListeners';
const LISTENER_TYPE = 'zenbpm:ExecutionListener';

const START_EVENT_TYPE = 'start';
const END_EVENT_TYPE = 'end';

type ListenerEventType = typeof START_EVENT_TYPE | typeof END_EVENT_TYPE;

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

// One duration of a retry backoff as the engine reads it: whole numbers, the
// units in this order, the time units behind a `T`. Years and months parse,
// so that they can be refused with a reason of their own.
const BACKOFF_DURATION = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:\d+W)?(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+S)?)?$/;

/**
 * A validation message as a translation template with its replacements, so
 * that a host's translate service can translate the message as it translates
 * labels.
 */
interface ValidationMessage {
  template: string;
  replacements?: Record<string, string | number>;
}

// ─── where the engine runs listeners ─────────────────────────────────────────

/**
 * The business object whose listeners the panel shows for the element. A pool
 * shows the listeners of its process, which is where the model carries them.
 */
function listenerOwnerOf(element: any): any {
  const bo = element.businessObject;
  return element.type === 'bpmn:Participant' && bo?.processRef ? bo.processRef : bo;
}

function isProcess(element: any): boolean {
  return listenerOwnerOf(element)?.$type === 'bpmn:Process';
}

type WorkOfABusinessRuleTask = 'decision' | 'jobWorker' | 'jobWorkerWithoutType' | 'none';

/**
 * How the engine takes a business rule task: one which names a decision calls
 * it, whatever else it carries; otherwise one whose task definition names a
 * job type is done by a job worker; any other is done by nobody. The panel's
 * Implementation entry, which goes by the mere presence of a task definition,
 * is no measure for where listeners run.
 */
function workOfABusinessRuleTask(bo: any): WorkOfABusinessRuleTask {
  if (getExtensionElement(bo, 'zenbpm:CalledDecision')?.decisionId) return 'decision';
  const taskDefinition = getExtensionElement(bo, 'zenbpm:TaskDefinition');
  if (taskDefinition?.type) return 'jobWorker';
  return taskDefinition ? 'jobWorkerWithoutType' : 'none';
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
  if (element.type === 'bpmn:BusinessRuleTask' && workOfABusinessRuleTask(element.businessObject) === 'jobWorker') {
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
function listenerEventTypesRunOn(element: any): ListenerEventType[] {
  if (isProcess(element)) return [];
  if (getMultiInstanceLoopCharacteristics(element)) return [];
  return listenerEventTypesOfTheElementAlone(element);
}

/** The containers of listeners the business object carries, in the order of the model. */
function listenerContainersOf(bo: any): any[] {
  return (bo?.extensionElements?.values || []).filter((value: any) => value.$instanceOf(CONTAINER_TYPE));
}

/**
 * Every execution listener of the business object, whatever its event type,
 * in the order of the model. A model may spread them over several
 * `executionListeners` elements; the engine reads all of them as one list.
 */
function getListeners(bo: any): any[] {
  return listenerContainersOf(bo).flatMap((container: any) => container.listeners || []);
}

/**
 * The retry backoff of a listener, which the engine reads. The panel offers
 * none to enter, but a model can carry one, as an attribute the moddle
 * descriptor may not declare.
 */
function retryBackoffOf(listener: any): string | undefined {
  return listener.get('retryBackoff');
}

// ─── validation ──────────────────────────────────────────────────────────────

/**
 * The engine takes `type`, `retries` and `retryBackoff` of a listener as
 * literals only, so that creating its job can never fail on an expression.
 */
function isExpression(value: string): boolean {
  return value.trim().startsWith('=');
}

/** Why the engine runs no listener on the element, with what to do about it. */
function whyNoListenerRunsOn(element: any): ValidationMessage {
  if (isProcess(element)) {
    return { template: 'Remove this listener: the engine runs no listener on the process itself' };
  }
  if (listenerEventTypesOfTheElementAlone(element).length > 0) {
    return { template: 'Remove this listener or the multi-instance marker: the engine runs no listener on a multi-instance activity' };
  }
  if (element.type === 'bpmn:StartEvent') {
    return { template: 'Remove this listener: the engine runs a listener on a start event only directly under the process' };
  }
  if (element.type === 'bpmn:BusinessRuleTask') {
    return whyNoListenerRunsOnTheBusinessRuleTask(element.businessObject);
  }
  return { template: 'Remove this listener: the engine runs listeners only on service, send and user tasks, job worker business rule tasks, message throw events and start events of the process' };
}

function whyNoListenerRunsOnTheBusinessRuleTask(bo: any): ValidationMessage {
  const work = workOfABusinessRuleTask(bo);
  if (work === 'jobWorkerWithoutType') {
    return { template: 'Enter the Type of the task definition: the engine runs listeners on a business rule task only once a job worker does it' };
  }
  if (work === 'decision' && getExtensionElement(bo, 'zenbpm:TaskDefinition')) {
    // Both implementations at once come from an imported model only: the
    // Implementation entry reads Job worker, but the engine calls the decision.
    return { template: 'Remove this listener or the called decision of the task: the engine calls the decision a business rule task names, and runs no listener there' };
  }
  return { template: 'Remove this listener or choose the Job worker implementation: the engine runs no listener on a business rule task which calls a decision' };
}

/**
 * Why the engine does not run the listener where it sits, or null, in the
 * order the engine checks it. A listener the panel would not create is still
 * shown with this reason, so that one imported or moved there can be seen and
 * removed.
 */
function validateListenerPlacement(element: any, eventType: string | undefined): ValidationMessage | null {
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

function validateListenerType(value: string | undefined, listener: any, listeners: any[]): ValidationMessage | null {
  if (!value || value.trim() === '') {
    return { template: 'Enter the job type of the listener' };
  }
  if (isExpression(value)) {
    return { template: 'Enter the job type as a literal: a listener takes no FEEL expression' };
  }
  if (sharesEventTypeAndType(listener, value, listeners)) {
    return { template: 'Enter another job type: two listeners of one event type need different types' };
  }
  return null;
}

/**
 * The engine reads the retries as a decimal integer with an optional sign,
 * and takes none below zero or above what 32 bits hold.
 */
function validateListenerRetries(value: string | undefined): ValidationMessage | null {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') return null;
  if (isExpression(trimmed)) {
    return { template: 'Enter the retries as a literal: a listener takes no FEEL expression' };
  }
  if (!/^[+-]?\d+$/.test(trimmed) || Number(trimmed) < 0 || Number(trimmed) > MAX_INT32) {
    return { template: 'Enter a whole number from 0 to {max}', replacements: { max: MAX_INT32 } };
  }
  return null;
}

/**
 * The engine reads the retry backoff as one ISO-8601 duration or several
 * separated by commas, one for each failure, and refuses a deployment with
 * one it cannot read. An empty one takes the engine's default.
 */
function validateListenerRetryBackoff(value: string | undefined): ValidationMessage | null {
  if (!value || value.trim() === '') return null;
  if (isExpression(value)) {
    return { template: 'Enter the retry backoff as a literal: a listener takes no FEEL expression' };
  }
  for (const entry of value.split(',')) {
    const duration = entry.trim();
    const parts = BACKOFF_DURATION.exec(duration);
    if (!parts || duration === 'P' || duration.endsWith('T')) {
      return { template: 'Enter an ISO-8601 duration such as PT10S, or several separated by commas' };
    }
    if (Number(parts[1] ?? 0) !== 0 || Number(parts[2] ?? 0) !== 0) {
      return { template: 'Enter the retry backoff in weeks, days, hours, minutes or seconds: the length of a year or a month depends on the date' };
    }
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
 * listeners container where they are missing, in one undoable step. The
 * engine runs listeners in the order of the model, so where a model spreads
 * them over several containers, the new one goes into the last.
 */
function addListener(element: any, eventType: ListenerEventType, bpmnFactory: any, commandStack: any): void {
  const bo = listenerOwnerOf(element);
  const commands: any[] = [];
  const container = listenerContainersOf(bo).pop() ?? createListenerContainer(element, bo, bpmnFactory, commands);

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

function createListenerContainer(element: any, bo: any, bpmnFactory: any, commands: any[]): any {
  const extensionElements = ensureExtensionElements(element, bo, bpmnFactory, commands);
  const container = bpmnFactory.create(CONTAINER_TYPE, { listeners: [] });
  container.$parent = extensionElements;
  commands.push({
    cmd: 'element.updateModdleProperties',
    context: {
      element,
      moddleElement: extensionElements,
      properties: { values: [...(extensionElements.values || []), container] },
    },
  });
  return container;
}

/**
 * Remove one listener from the container it sits in. A container left without
 * listeners is removed as well, so that no empty `executionListeners` stays
 * in the XML; the other containers of the element keep their listeners.
 */
function removeListener(element: any, listener: any, commandStack: any): void {
  const bo = listenerOwnerOf(element);
  const container = listenerContainersOf(bo).find((candidate: any) => (candidate.listeners || []).includes(listener));
  if (!container) return;

  const remaining = container.listeners.filter((value: any) => value !== listener);
  if (remaining.length === 0) {
    removeExtensionValue(element, bo, container, commandStack);
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

// A text entry reads an empty field as no value. An attribute a model carries
// empty is therefore read as no value too, or leaving its field untouched
// would count as a change and rewrite the model.

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
    getValue: () => listener.type || undefined,
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
    getValue: () => listener.retries || undefined,
    setValue: (value: string | undefined) =>
      updateListener(element, listener, { retries: value && value.trim() !== '' ? value : undefined }, commandStack),
    validate: (value: string) => translated(translate, validateListenerRetries(value)),
    debounce,
  });
}

function RetryBackoffEntry(props: any) {
  const { element, id, listener } = props;
  const commandStack = useService('commandStack');
  const translate    = useService('translate');
  const debounce     = useService('debounceInput');

  return TextFieldEntry({
    element,
    id,
    label: translate('Retry backoff'),
    description: translate('ISO-8601 duration such as PT10S, or several separated by commas, one for each failure. The engine default when empty.'),
    getValue: () => retryBackoffOf(listener) || undefined,
    setValue: (value: string | undefined) =>
      updateListener(element, listener, { retryBackoff: value && value.trim() !== '' ? value : undefined }, commandStack),
    validate: (value: string) => translated(translate, validateListenerRetryBackoff(value)),
    debounce,
  });
}

// The panel offers no retry backoff to enter. A listener which came with one
// shows it, so that one the engine refuses can be seen, corrected or cleared;
// its field stays while it is being edited, an emptied one included.
const listenersWhichCameWithARetryBackoff = new WeakSet<object>();

function showsRetryBackoff(listener: any): boolean {
  if (retryBackoffOf(listener) !== undefined) listenersWhichCameWithARetryBackoff.add(listener);
  return listenersWhichCameWithARetryBackoff.has(listener);
}

// ─── group ───────────────────────────────────────────────────────────────────

const EXECUTION_LISTENER_GROUP_ID = 'zenbpm-executionListener';

// A list item keeps what the user did to it, such as having opened it, by its
// id. The id therefore follows the listener and not its position, or removing
// one listener would hand its state to the next.
const itemNumbers = new WeakMap<object, number>();
let nextItemNumber = 0;

function itemNumberOf(listener: any): number {
  let itemNumber = itemNumbers.get(listener);
  if (itemNumber === undefined) {
    itemNumber = nextItemNumber++;
    itemNumbers.set(listener, itemNumber);
  }
  return itemNumber;
}

/**
 * The list group with the reasons the engine does not run its listeners made
 * known to the panel. An entry shows the reason of its own validation only
 * while its list item is open; known to the panel, the reasons also mark the
 * group, so that a collapsed one does not hide that a deployment will fail.
 */
function ExecutionListenersGroup(props: any) {
  const { listenerErrors, ...group } = props;
  const { errors } = useContext(ErrorsContext);
  return createElement(
    ErrorsContext.Provider,
    { value: { errors: { ...errors, ...listenerErrors } } },
    createElement(ListGroup, group),
  );
}

/**
 * The Execution listeners group: offered where the engine runs listeners,
 * where one more listener can always be created behind the ones there, and
 * shown on any element that has listeners, so that one the engine does not
 * run there can be removed. Null when neither applies.
 */
export function createExecutionListenerGroup(element: any, injector: any): any | null {
  const listeners = getListeners(listenerOwnerOf(element));
  const eventTypes = listenerEventTypesRunOn(element);
  if (eventTypes.length === 0 && listeners.length === 0) return null;

  const commandStack = injector.get('commandStack');
  const bpmnFactory  = injector.get('bpmnFactory');
  const translate    = injector.get('translate');
  const eventBus     = injector.get('eventBus');

  // The entries are named by the position of their listener, which is what a
  // host addresses them by.
  const entriesId = (index: number) => `${element.id}-zenbpm-executionListener-${index}`;

  const listenerErrors: Record<string, string> = {};
  const check = (entryId: string, message: ValidationMessage | null) => {
    if (message) listenerErrors[entryId] = translated(translate, message) as string;
  };

  const items = listeners.map((listener: any, index: number) => {
    const id = entriesId(index);
    const entries = [
      // extras such as `listener` are spread into the component's props by CollapsibleEntry
      { id: `${id}-eventType`, component: EventTypeEntry, isEdited: isSelectEntryEdited, listener },
      { id: `${id}-type`, component: TypeEntry, isEdited: isTextFieldEntryEdited, listener, listeners },
      { id: `${id}-retries`, component: RetriesEntry, isEdited: isTextFieldEntryEdited, listener },
    ];
    check(`${id}-eventType`, validateListenerPlacement(element, listener.eventType));
    check(`${id}-type`, validateListenerType(listener.type, listener, listeners));
    check(`${id}-retries`, validateListenerRetries(listener.retries));
    if (showsRetryBackoff(listener)) {
      entries.push({ id: `${id}-retryBackoff`, component: RetryBackoffEntry, isEdited: isTextFieldEntryEdited, listener });
      check(`${id}-retryBackoff`, validateListenerRetryBackoff(retryBackoffOf(listener)));
    }
    return {
      id: `${element.id}-zenbpm-executionListener-item-${itemNumberOf(listener)}`,
      label: translate('{eventType}: {type}', {
        eventType: eventTypeLabel(translate, listener.eventType),
        type: listener.type || translate('<no type>'),
      }),
      entries,
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
      setTimeout(() => eventBus.fire('propertiesPanel.showEntry', { id: `${entriesId(listeners.length)}-type` }), 0);
    }
    : undefined;

  return {
    id: EXECUTION_LISTENER_GROUP_ID,
    label: translate('Execution listeners'),
    component: ExecutionListenersGroup,
    items,
    add,
    listenerErrors,
    // a group with a listener the engine does not run opens by itself, until the user closes it
    shouldOpen: Object.keys(listenerErrors).length > 0,
  };
}

// ─── keeping the panel in step ───────────────────────────────────────────────

const SEQUENCE_FLOW_COMMANDS = [ 'connection.create', 'connection.delete', 'connection.reconnect' ];

/**
 * Whether a listener can run depends on the outgoing sequence flows of its
 * element. The modeler reports a drawn, removed or reconnected flow as a
 * change of the flow alone, also when the change is undone or redone, so the
 * panel would keep showing what held before for the element it has open. This
 * reports the elements such a flow left or leaves as changed as well.
 */
export function reportSourcesOfChangedSequenceFlows(injector: any): void {
  const eventBus        = injector.get('eventBus');
  const elementRegistry = injector.get('elementRegistry');

  let sources: any[] = [];

  const events = SEQUENCE_FLOW_COMMANDS.flatMap((command) => [
    `commandStack.${command}.executed`,
    `commandStack.${command}.reverted`,
  ]);
  eventBus.on(events, ({ context }: any) => {
    sources.push(context.source, context.oldSource, context.newSource, context.connection?.source);
  });

  // fired once the modeler has reported the changes of the command itself
  eventBus.on('commandStack.changed', () => {
    const elements = [ ...new Set(sources) ].filter((source) => source && elementRegistry.get(source.id) === source);
    sources = [];
    if (elements.length > 0) eventBus.fire('elements.changed', { elements });
  });
}
