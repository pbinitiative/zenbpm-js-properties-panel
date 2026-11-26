import { FeelEntry, SelectEntry, isFeelEntryEdited, isSelectEntryEdited } from '@bpmn-io/properties-panel';
import { createElement } from '@bpmn-io/properties-panel/preact';
import { useService } from 'bpmn-js-properties-panel';

/**
 * Timer group of the ZenBPM engine.
 *
 * The stock bpmn-js-properties-panel offers the value of a timer event
 * definition (timeDate / timeDuration / timeCycle) as a plain text field. The
 * engine also takes a FEEL expression there: a value starting with `=` is
 * evaluated against the variables of the process instance when the timer is
 * created, any other value is a literal. These entries keep the ids and the
 * model of the stock ones (a `bpmn:FormalExpression` whose body is the value,
 * the `=` included) and only turn the value into a field which is either
 * static or a FEEL expression.
 */

// in the order the stock provider reads them
const TIMER_DEFINITION_TYPES = ['timeDate', 'timeCycle', 'timeDuration'];

const TIMER_ELEMENT_TYPES = ['bpmn:StartEvent', 'bpmn:IntermediateCatchEvent', 'bpmn:BoundaryEvent'];

/**
 * The `bpmn:TimerEventDefinition` of the element, or `undefined` if it has
 * none.
 */
export function getTimerEventDefinition(element: any): any {
  const eventDefinitions = element?.businessObject?.eventDefinitions || [];
  return eventDefinitions.find((definition: any) => definition.$instanceOf('bpmn:TimerEventDefinition'));
}

/**
 * Which of timeDate / timeCycle / timeDuration the timer event definition
 * carries, or `undefined` if none is set yet.
 */
export function getTimerDefinitionType(timerEventDefinition: any): string | undefined {
  if (!timerEventDefinition) return undefined;
  return TIMER_DEFINITION_TYPES.find((type) => timerEventDefinition.get(type) !== undefined);
}

/**
 * Whether the element is the start event of a process itself, as opposed to
 * that of an event sub-process. The engine creates its timer when the process
 * is deployed, where no process instance and so no variables exist.
 */
export function isProcessStartEvent(element: any): boolean {
  const bo = element?.businessObject;
  if (!bo || !bo.$instanceOf('bpmn:StartEvent')) return false;
  return !bo.$parent?.$instanceOf('bpmn:SubProcess');
}

function isTimerSupported(element: any): boolean {
  const bo = element?.businessObject;
  if (!bo) return false;
  return TIMER_ELEMENT_TYPES.some((type) => bo.$instanceOf(type)) && !!getTimerEventDefinition(element);
}

function createTimerFormalExpression(bpmnFactory: any, timerEventDefinition: any, body?: string) {
  const formalExpression = bpmnFactory.create('bpmn:FormalExpression', { body });
  formalExpression.$parent = timerEventDefinition;
  return formalExpression;
}

function TimerTypeEntry(props: any) {
  const { element } = props;
  const commandStack = useService('commandStack');
  const bpmnFactory = useService('bpmnFactory');
  const translate = useService('translate');

  const timerEventDefinition = getTimerEventDefinition(element);
  const timerDefinitionType = getTimerDefinitionType(timerEventDefinition);

  const getValue = () => timerDefinitionType || '';

  const setValue = (value: string) => {
    if (value === (timerDefinitionType || '')) return;

    // one type at a time: the chosen one starts empty, the others are removed
    const properties: Record<string, any> = {
      timeDuration: undefined,
      timeDate: undefined,
      timeCycle: undefined,
    };
    if (value !== '') {
      properties[value] = createTimerFormalExpression(bpmnFactory, timerEventDefinition);
    }

    commandStack.execute('element.updateModdleProperties', {
      element,
      moddleElement: timerEventDefinition,
      properties,
    });
  };

  // Every type is offered on every element: which combinations run is the
  // engine's to say, and it takes more of them than the Zeebe provider offers.
  const getOptions = () => [
    { value: '', label: translate('<none>') },
    { value: 'timeDate', label: translate('Date') },
    { value: 'timeDuration', label: translate('Duration') },
    { value: 'timeCycle', label: translate('Cycle') },
  ];

  return SelectEntry({
    element,
    id: 'timerEventDefinitionType',
    label: translate('Type'),
    getValue,
    setValue,
    getOptions,
  });
}

function TimerValueEntry(props: any) {
  const { element } = props;
  const commandStack = useService('commandStack');
  const bpmnFactory = useService('bpmnFactory');
  const translate = useService('translate');
  const debounce = useService('debounceInput');

  const timerEventDefinition = getTimerEventDefinition(element);
  const timerDefinitionType = getTimerDefinitionType(timerEventDefinition) as string;
  const formalExpression = timerEventDefinition.get(timerDefinitionType);

  const getValue = () => formalExpression && formalExpression.get('body');

  // The body is updated in place and kept when it is emptied: removing the
  // expression would unset the type chosen above.
  const setValue = (value: string | undefined) => {
    if (!formalExpression) {
      commandStack.execute('element.updateModdleProperties', {
        element,
        moddleElement: timerEventDefinition,
        properties: { [timerDefinitionType]: createTimerFormalExpression(bpmnFactory, timerEventDefinition, value) },
      });
      return;
    }

    commandStack.execute('element.updateModdleProperties', {
      element,
      moddleElement: formalExpression,
      properties: { body: value },
    });
  };

  return FeelEntry({
    element,
    id: 'timerEventDefinitionValue',
    label: translate('Value'),
    feel: 'optional',
    getValue,
    setValue,
    debounce,
    tooltip: getTimerValueTooltip(timerDefinitionType, translate, isProcessStartEvent(element)),
  });
}

function example(code: string, description: string) {
  return createElement('li', null, createElement('code', null, code), ' - ', description);
}

/**
 * What the value of a timer may be, with examples. The start event of a
 * process is told apart: its expression has no variables to read, and the
 * engine takes no duration there.
 */
export function getTimerValueTooltip(timerDefinitionType: string, translate: (text: string) => string, processStart = false) {
  const evaluated = processStart
    ? translate('The start event of a process has no variables: an expression is evaluated when the process is deployed and can only use functions such as now().')
    : translate('The value is evaluated when the timer is created.');

  switch (timerDefinitionType) {
    case 'timeDate':
      return createElement('div', null,
        createElement('p', null, translate('A specific point in time: an ISO 8601 date and time, or a FEEL expression.')),
        createElement('ul', null,
          example('2026-10-01T12:00:00Z', translate('UTC time')),
          example('2026-10-02T08:09:40+02:00', translate('UTC plus 2 hours zone offset')),
          ...(processStart
            ? [ example('=now() + duration("PT1H")', translate('an hour after the process is deployed')) ]
            : [
              example('=dueAt', translate('the date and time a process variable holds')),
              example('=date and time(sentAt) + duration("P3D")', translate('three days after a process variable')),
            ]),
        ),
        createElement('p', null, evaluated),
      );
    case 'timeDuration':
      if (processStart) {
        return createElement('div', null,
          createElement('p', null, translate('The engine takes no duration on the start event of a process: there is nothing to measure it from. Use a date or a cycle.')),
        );
      }
      return createElement('div', null,
        createElement('p', null, translate('A time period: an ISO 8601 duration, or a FEEL expression.')),
        createElement('ul', null,
          example('PT15S', translate('15 seconds')),
          example('PT1H30M', translate('1 hour and 30 minutes')),
          example('P14D', translate('14 days')),
          example('=reminderAfter', translate('the duration a process variable holds')),
          example('=date and time(deadline) - now()', translate('the time left until a process variable; at once if it has passed')),
        ),
        createElement('p', null, evaluated),
      );
    case 'timeCycle':
      return createElement('div', null,
        createElement('p', null, translate('A cycle: an ISO 8601 repeating interval, a cron expression, or a FEEL expression.')),
        createElement('ul', null,
          example('R5/PT10S', translate('every 10 seconds, up to 5 times')),
          example('R/P1D', translate('every day, infinitely')),
          example('0 0 9-17 * * MON-FRI', translate('every hour on the hour from 9 a.m. to 5 p.m., Monday to Friday, in the time zone of the engine')),
          ...(processStart ? [] : [ example('=reminderCycle', translate('the cycle a process variable holds')) ]),
        ),
        createElement('p', null, processStart
          ? evaluated
          : translate('The value is evaluated once, when the first timer of the cycle is created.')),
      );
  }
  return undefined;
}

// ─── exported entry list ─────────────────────────────────────────────────────

/**
 * Entries of the timer group: the type of the timer, and its value once a type
 * is chosen. Empty for an element without a timer event definition.
 */
export function TimerProps(element: any) {
  if (!isTimerSupported(element)) return [];

  const entries: any[] = [
    { id: 'timerEventDefinitionType', component: TimerTypeEntry, isEdited: isSelectEntryEdited },
  ];

  if (getTimerDefinitionType(getTimerEventDefinition(element))) {
    entries.push({ id: 'timerEventDefinitionValue', component: TimerValueEntry, isEdited: isFeelEntryEdited });
  }

  return entries;
}
