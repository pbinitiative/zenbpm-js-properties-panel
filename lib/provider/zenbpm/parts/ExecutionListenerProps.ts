import {
  ErrorsContext,
  ListGroup,
  SelectEntry,
  TextFieldEntry,
  isSelectEntryEdited,
  isTextFieldEntryEdited,
  useLayoutState,
} from '@bpmn-io/properties-panel';
import { createElement } from '@bpmn-io/properties-panel/preact';
import { useContext, useEffect } from '@bpmn-io/properties-panel/preact/hooks';
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
const MAX_INT64 = '9223372036854775807';

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

/** The name of an extension element as the XML writes it, without its prefix: `taskListeners` for `zenbpm:TaskListeners`. */
function xmlNameOf(extensionElement: any): string {
  const name: string = (extensionElement.$type ?? '').split(':').pop();
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/** A listener the engine reads nowhere, with the `taskListeners` element it sits in, if it sits in one. */
interface ListenerNotRead {
  listener: any;
  container?: any;
  isTaskListener: boolean;
}

/**
 * The listeners of the business object which the engine reads nowhere, in
 * the order of the model: every task listener, and an execution listener
 * directly in the extension elements, outside an `executionListeners`
 * element, which is where Camunda 7 writes one. The engine refuses a model
 * with any of them, but for such an execution listener on the process, which
 * it ignores. As the engine, this goes by the name of the XML element,
 * whatever its prefix.
 */
function listenersNotReadOf(bo: any): ListenerNotRead[] {
  return (bo?.extensionElements?.values || []).flatMap((value: any): ListenerNotRead[] => {
    switch (xmlNameOf(value)) {
    case 'taskListeners':
      return (value.listeners || []).map((listener: any) => ({ listener, container: value, isTaskListener: true }));
    case 'taskListener':
      return [ { listener: value, isTaskListener: true } ];
    case 'executionListener':
      return [ { listener: value, isTaskListener: false } ];
    default:
      return [];
    }
  });
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

// The engine neither runs nor refuses a listener on the process itself, so
// one there is shown with this note and without a reason to correct it: a
// model with it is deployed as one without.
const NOTE_ON_A_LISTENER_OF_THE_PROCESS = 'The engine runs no listener on the process itself and ignores this one. It can be removed.';

/**
 * Why the engine runs no listener on the element, which is not the process,
 * with what to do about it.
 */
function whyNoListenerRunsOn(element: any): ValidationMessage {
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
 * Why the engine refuses the listener where it sits, or null, in the order
 * the engine checks it. A listener the panel would not create is still shown
 * with this reason, so that one imported or moved there can be seen and
 * removed.
 */
function validateListenerPlacement(element: any, eventType: string | undefined): ValidationMessage | null {
  if (isProcess(element)) return null;
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
  // modeler keeps in step with the sequence flows it draws. A model from
  // elsewhere can come with a flow its source does not name: drawn as every
  // other, and still none to the engine.
  if ((element.businessObject.get('outgoing') || []).length === 0) {
    return (element.outgoing || []).some((connection: any) => connection.type === 'bpmn:SequenceFlow')
      ? { template: 'Draw the outgoing sequence flow again: the model does not name it as outgoing of this element, which is what the engine follows' }
      : { template: 'Connect an outgoing sequence flow: the token could not leave the element once the listener\'s job is completed' };
  }
  return null;
}

/**
 * Why the engine refuses a model with the listener it reads nowhere, or null
 * for the one it ignores: an execution listener on the process.
 */
function whyTheEngineRefuses(element: any, { isTaskListener }: ListenerNotRead): ValidationMessage | null {
  if (isTaskListener) {
    return { template: 'Remove this listener: the engine runs no task listener' };
  }
  if (isProcess(element)) return null;
  return { template: 'Remove this listener: the engine refuses an execution listener outside an executionListeners element' };
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

/**
 * What the validation finds in an attribute of a listener of the element,
 * and nothing where the engine runs no listener: there the one thing to say
 * is that it does not run, beside which "Enter the job type" would ask for
 * the opposite of "Remove this listener". The attributes are checked once
 * the engine runs the listener.
 */
function validateAttribute(element: any, validation: () => ValidationMessage | null): ValidationMessage | null {
  return listenerEventTypesRunOn(element).length > 0 ? validation() : null;
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

/** Whether the engine can read the digits as a number, which it holds in 64 bits. */
function fitsInto64Bits(digits: string): boolean {
  const significant = digits.replace(/^0+/, '');
  return significant.length < MAX_INT64.length || (significant.length === MAX_INT64.length && significant <= MAX_INT64);
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
    if (!(duration.match(/\d+/g) ?? []).every(fitsInto64Bits)) {
      return { template: 'Enter smaller numbers: the engine reads none above {max}', replacements: { max: MAX_INT64 } };
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

/**
 * How the list names a listener the engine reads nowhere. One of another
 * engine names its code where a listener of this engine names its job type.
 */
function labelOfAListenerNotRead(translate: any, { listener, isTaskListener }: ListenerNotRead): string {
  const type = listener.type || listener.class || listener.delegateExpression || listener.expression || translate('<no type>');
  return isTaskListener
    ? translate('Task listener "{eventType}": {type}', { eventType: listener.eventType ?? listener.event ?? '', type })
    : translate('Listener outside executionListeners: {type}', { type });
}

/**
 * The event type as the panel words it. One the engine does not know is shown
 * as the model writes it, in quotes: the engine compares the event type as it
 * is written, so an `End` of the model is another than the End it runs.
 */
function eventTypeLabel(translate: any, eventType: string | undefined): string {
  if (eventType === START_EVENT_TYPE) return translate('Start');
  if (eventType === END_EVENT_TYPE) return translate('End');
  return eventType ? translate('"{eventType}"', { eventType }) : translate('<none>');
}

/**
 * The label of a list item, marked where its listener is flagged. The reason
 * shows only in an open item, and a group opens with its items closed, so the
 * label is what tells the flagged listener from the others.
 */
function itemLabel(translate: any, label: string, isFlagged: boolean): string {
  return isFlagged ? translate('⚠ {label}', { label }) : label;
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
  if (container) removeFromContainer(element, bo, container, listener, commandStack);
}

/** Remove a listener the engine reads nowhere, and the `taskListeners` element it was the last of. */
function removeListenerNotRead(element: any, { listener, container }: ListenerNotRead, commandStack: any): void {
  const bo = listenerOwnerOf(element);
  if (container) {
    removeFromContainer(element, bo, container, listener, commandStack);
  } else {
    removeExtensionValue(element, bo, listener, commandStack);
  }
}

function removeFromContainer(element: any, bo: any, container: any, listener: any, commandStack: any): void {
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
    description: isProcess(element) ? translate(NOTE_ON_A_LISTENER_OF_THE_PROCESS) : undefined,
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
    validate: (value: string) =>
      translated(translate, validateAttribute(element, () => validateListenerType(value, listener, listeners))),
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
    description: translate('Optional; the engine default when empty. The engine lowers a number above its configured maximum to that maximum.'),
    getValue: () => listener.retries || undefined,
    setValue: (value: string | undefined) =>
      updateListener(element, listener, { retries: value && value.trim() !== '' ? value : undefined }, commandStack),
    validate: (value: string) => translated(translate, validateAttribute(element, () => validateListenerRetries(value))),
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
    validate: (value: string) => translated(translate, validateAttribute(element, () => validateListenerRetryBackoff(value))),
    debounce,
  });
}

/**
 * The one entry of a listener the engine reads nowhere: why the engine
 * refuses the model with it, or that the engine ignores it. Such a listener
 * has nothing to edit which would make the engine read it, so it is shown to
 * be removed.
 */
function ListenerNotReadEntry(props: any) {
  const { id, reason, note } = props;
  return createElement(
    'div',
    { class: reason ? 'bio-properties-panel-entry has-error' : 'bio-properties-panel-entry', 'data-entry-id': id },
    reason
      ? createElement('div', { class: 'bio-properties-panel-error' }, reason)
      : createElement('div', { class: 'bio-properties-panel-description' }, note),
  );
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
// one listener would hand its state to the next. The listeners of an element
// are numbered as the panel first sees them, each element from zero, so that
// a model read anew gets the ids it had.
const itemNumbersOfOwners = new WeakMap<object, { ofListeners: WeakMap<object, number>; next: number }>();

function itemNumberOf(owner: any, listener: any): number {
  let itemNumbers = itemNumbersOfOwners.get(owner);
  if (!itemNumbers) {
    itemNumbers = { ofListeners: new WeakMap(), next: 0 };
    itemNumbersOfOwners.set(owner, itemNumbers);
  }
  let itemNumber = itemNumbers.ofListeners.get(listener);
  if (itemNumber === undefined) {
    itemNumber = itemNumbers.next++;
    itemNumbers.ofListeners.set(listener, itemNumber);
  }
  return itemNumber;
}

/**
 * The list group with the reasons the engine does not run its listeners made
 * known to the panel. An entry shows the reason of its own validation only
 * while its list item is open; known to the panel, the reasons also mark the
 * group, so that a collapsed one does not hide that a deployment will fail.
 *
 * A group with such a reason opens by itself when its element is shown, and
 * is left to the user from then on. It must not follow the reasons any
 * closer: a group which closed with the last of them would take the field
 * away in which the user is correcting it.
 */
function ExecutionListenersGroup(props: any) {
  const { listenerErrors, ...group } = props;
  const { errors } = useContext(ErrorsContext);

  // the panel keeps whether a group is open under this path, for every element alike
  const [ , setOpen ] = useLayoutState([ 'groups', group.id, 'open' ], false);
  useEffect(() => {
    if (Object.keys(listenerErrors).length > 0) setOpen(true);
  }, [ group.element ]);

  return createElement(
    ErrorsContext.Provider,
    { value: { errors: { ...errors, ...listenerErrors } } },
    createElement(ListGroup, group),
  );
}

/**
 * The Execution listeners group: offered where the engine runs listeners,
 * where one more listener can always be created behind the ones there, and
 * shown on any element that has listeners, those the engine reads nowhere
 * included, so that one the engine refuses or ignores there can be removed.
 * Null when neither applies.
 */
export function createExecutionListenerGroup(element: any, injector: any): any | null {
  const owner = listenerOwnerOf(element);
  const listeners = getListeners(owner);
  const listenersNotRead = listenersNotReadOf(owner);
  const eventTypes = listenerEventTypesRunOn(element);
  if (eventTypes.length === 0 && listeners.length === 0 && listenersNotRead.length === 0) return null;

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
  const isFlagged = (entries: { id: string }[]) => entries.some((entry) => entry.id in listenerErrors);

  const items = listeners.map((listener: any, index: number) => {
    const id = entriesId(index);
    const entries = [
      // extras such as `listener` are spread into the component's props by CollapsibleEntry
      { id: `${id}-eventType`, component: EventTypeEntry, isEdited: isSelectEntryEdited, listener },
      { id: `${id}-type`, component: TypeEntry, isEdited: isTextFieldEntryEdited, listener, listeners },
      { id: `${id}-retries`, component: RetriesEntry, isEdited: isTextFieldEntryEdited, listener },
    ];
    check(`${id}-eventType`, validateListenerPlacement(element, listener.eventType));
    check(`${id}-type`, validateAttribute(element, () => validateListenerType(listener.type, listener, listeners)));
    check(`${id}-retries`, validateAttribute(element, () => validateListenerRetries(listener.retries)));
    if (showsRetryBackoff(listener)) {
      entries.push({ id: `${id}-retryBackoff`, component: RetryBackoffEntry, isEdited: isTextFieldEntryEdited, listener });
      check(`${id}-retryBackoff`, validateAttribute(element, () => validateListenerRetryBackoff(retryBackoffOf(listener))));
    }
    return {
      id: `${element.id}-zenbpm-executionListener-item-${itemNumberOf(owner, listener)}`,
      label: itemLabel(translate, translate('{eventType}: {type}', {
        eventType: eventTypeLabel(translate, listener.eventType),
        type: listener.type || translate('<no type>'),
      }), isFlagged(entries)),
      entries,
      autoFocusEntry: `${id}-type`,
      remove: () => removeListener(element, listener, commandStack),
    };
  });

  // Behind them, the listeners the engine reads nowhere, each with the reason
  // or the note as its one entry.
  const itemsOfListenersNotRead = listenersNotRead.map((listenerNotRead: ListenerNotRead, index: number) => {
    const entryId = `${element.id}-zenbpm-listenerNotRead-${index}-reason`;
    const reason = translated(translate, whyTheEngineRefuses(element, listenerNotRead));
    if (reason) listenerErrors[entryId] = reason;
    return {
      id: `${element.id}-zenbpm-executionListener-item-${itemNumberOf(owner, listenerNotRead.listener)}`,
      label: itemLabel(translate, labelOfAListenerNotRead(translate, listenerNotRead), reason !== null),
      entries: [ { id: entryId, component: ListenerNotReadEntry, reason, note: translate(NOTE_ON_A_LISTENER_OF_THE_PROCESS) } ],
      remove: () => removeListenerNotRead(element, listenerNotRead, commandStack),
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
    items: [ ...items, ...itemsOfListenersNotRead ],
    add,
    listenerErrors,
  };
}

// ─── keeping the panel in step ───────────────────────────────────────────────

const CONNECTION_COMMANDS = [ 'connection.create', 'connection.delete', 'connection.reconnect' ];

/**
 * Whether a listener can run depends on the outgoing sequence flows of its
 * element. The modeler reports a drawn, removed or reconnected flow as a
 * change of the flow alone, also when the change is undone or redone, so the
 * panel would keep showing what held before for the element it has open. This
 * reports the elements such a flow left or leaves as changed as well. Another
 * connection, such as a message flow or an association, says nothing about a
 * listener, so its ends are left alone.
 */
export function reportSourcesOfChangedSequenceFlows(injector: any): void {
  const eventBus        = injector.get('eventBus');
  const elementRegistry = injector.get('elementRegistry');

  let sources: any[] = [];

  const events = CONNECTION_COMMANDS.flatMap((command) => [
    `commandStack.${command}.executed`,
    `commandStack.${command}.reverted`,
  ]);
  eventBus.on(events, ({ context }: any) => {
    if (context.connection?.type !== 'bpmn:SequenceFlow') return;
    sources.push(context.source, context.oldSource, context.newSource, context.connection.source);
  });

  // fired once the modeler has reported the changes of the command itself
  eventBus.on('commandStack.changed', () => {
    const elements = [ ...new Set(sources) ].filter((source) => source && elementRegistry.get(source.id) === source);
    sources = [];
    if (elements.length > 0) eventBus.fire('elements.changed', { elements });
  });
}
