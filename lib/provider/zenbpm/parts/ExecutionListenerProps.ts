import {
  TextFieldEntry,
  isTextFieldEntryEdited,
} from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { getExtensionElement, removeExtensionElement } from '../../../util/ExtensionElementsUtil';

const CONTAINER_TYPE = 'zenbpm:ExecutionListeners';
const LISTENER_TYPE = 'zenbpm:ExecutionListener';

// The one event type the engine runs: on a start event, the listener's job is
// created when a token reaches the event, and the token leaves it once the job
// is completed.
const END_EVENT_TYPE = 'end';

const MAX_INT32 = 2147483647;

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

/** The `end` listener of the element, or undefined when it has none. */
export function getEndListener(bo: any): any {
  const container = getExtensionElement(bo, CONTAINER_TYPE);
  return (container?.listeners || []).find((listener: any) => listener.eventType === END_EVENT_TYPE);
}

/**
 * The engine takes `type`, `retries` and `retryBackoff` of a listener as
 * literals only, so that creating its job can never fail on an expression.
 */
function isExpression(value: string): boolean {
  return value.trim().startsWith('=');
}

export function validateListenerType(value: string | undefined): string | null {
  if (value && isExpression(value)) {
    return 'Enter the job type as a literal: a listener takes no FEEL expression';
  }
  return null;
}

export function validateListenerRetries(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') return null;
  if (isExpression(trimmed)) {
    return 'Enter the retries as a literal: a listener takes no FEEL expression';
  }
  if (!/^\d+$/.test(trimmed) || Number(trimmed) > MAX_INT32) {
    return `Enter a whole number from 0 to ${MAX_INT32}`;
  }
  return null;
}

// ─── commands ────────────────────────────────────────────────────────────────

/**
 * Give the element an `end` listener of the given job type, creating the
 * extension elements and the listeners container where they are missing, in
 * one undoable step.
 */
function createEndListener(element: any, bo: any, type: string, bpmnFactory: any, commandStack: any): void {
  const commands: any[] = [];

  let extensionElements = bo.extensionElements;
  if (!extensionElements) {
    extensionElements = bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
    extensionElements.$parent = bo;
    commands.push({
      cmd: 'element.updateModdleProperties',
      context: { element, moddleElement: bo, properties: { extensionElements } },
    });
  }

  let container = (extensionElements.values || []).find((value: any) => value.$instanceOf(CONTAINER_TYPE));
  if (!container) {
    container = bpmnFactory.create(CONTAINER_TYPE, { listeners: [] });
    container.$parent = extensionElements;
    commands.push({
      cmd: 'element.updateModdleProperties',
      context: {
        element,
        moddleElement: extensionElements,
        properties: { values: [...(extensionElements.values || []), container] },
      },
    });
  }

  const listener = bpmnFactory.create(LISTENER_TYPE, { eventType: END_EVENT_TYPE, type });
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
 * Remove the element's `end` listener. A container left without listeners is
 * removed as well, so that no empty `executionListeners` stays in the XML.
 */
function removeEndListener(element: any, bo: any, commandStack: any): void {
  const container = getExtensionElement(bo, CONTAINER_TYPE);
  const listener = getEndListener(bo);
  if (!container || !listener) return;

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

// ─── entry components ────────────────────────────────────────────────────────

function TypeEntry(props: any) {
  const { element } = props;
  const commandStack = useService('commandStack');
  const bpmnFactory  = useService('bpmnFactory');
  const translate    = useService('translate');
  const debounce     = useService('debounceInput');

  const bo = element.businessObject;

  const getValue = () => getEndListener(bo)?.type ?? '';

  // Clearing the type removes the listener: a listener without a job type
  // would be refused at deployment.
  const setValue = (value: string | undefined) => {
    const listener = getEndListener(bo);
    if (!value || value.trim() === '') {
      removeEndListener(element, bo, commandStack);
    } else if (listener) {
      commandStack.execute('element.updateModdleProperties', {
        element,
        moddleElement: listener,
        properties: { type: value },
      });
    } else {
      createEndListener(element, bo, value, bpmnFactory, commandStack);
    }
  };

  return TextFieldEntry({
    element,
    id: 'zenbpm-executionListener-type',
    label: translate('Type'),
    description: translate(
      'Job type of the listener. A worker completes the job before the token leaves the start event. Leave empty for no listener.'
    ),
    getValue,
    setValue,
    validate: (value: string) => validateListenerType(value),
    debounce,
  });
}

function RetriesEntry(props: any) {
  const { element } = props;
  const commandStack = useService('commandStack');
  const translate    = useService('translate');
  const debounce     = useService('debounceInput');

  const bo = element.businessObject;

  const getValue = () => getEndListener(bo)?.retries ?? '';

  const setValue = (value: string | undefined) => {
    const listener = getEndListener(bo);
    if (!listener) return;
    commandStack.execute('element.updateModdleProperties', {
      element,
      moddleElement: listener,
      properties: { retries: value && value.trim() !== '' ? value : undefined },
    });
  };

  return TextFieldEntry({
    element,
    id: 'zenbpm-executionListener-retries',
    label: translate('Retries'),
    description: translate('Optional; the engine default when empty.'),
    getValue,
    setValue,
    validate: (value: string) => validateListenerRetries(value),
    debounce,
  });
}

// ─── exported entry list ─────────────────────────────────────────────────────

export function ExecutionListenerProps(element: any) {
  if (!canHaveExecutionListener(element)) return [];

  const entries: any[] = [
    { id: 'zenbpm-executionListener-type', component: TypeEntry, isEdited: isTextFieldEntryEdited },
  ];
  if (getEndListener(element.businessObject)) {
    entries.push({ id: 'zenbpm-executionListener-retries', component: RetriesEntry, isEdited: isTextFieldEntryEdited });
  }
  return entries;
}
