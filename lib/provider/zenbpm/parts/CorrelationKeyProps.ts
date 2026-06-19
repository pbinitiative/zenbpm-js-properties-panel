import {
  FeelEntry,
  isFeelEntryEdited,
} from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { getExtensionElement, updateExtensionElementProps } from '../../../util/ExtensionElementsUtil';
import { getFeelValue } from '../../../util/FeelUtil';

const TYPE = 'zenbpm:Subscription';
const ID   = 'zenbpm-messageSubscriptionCorrelationKey';

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Return the bpmn:Message associated with the given diagram element, or
 * undefined if the element has no message (and therefore no subscription).
 *
 * ZenBPM only considers the following elements to be message subscribers:
 *   - bpmn:IntermediateCatchEvent (with bpmn:MessageEventDefinition)
 *   - bpmn:BoundaryEvent          (with bpmn:MessageEventDefinition)
 *   - bpmn:StartEvent             (only inside an event sub-process)
 * ReceiveTask / EndEvent / IntermediateThrowEvent are not subscription points.
 */
function getMessage(element: any): any {
  const bo = element.businessObject;
  const eventDefinitions = bo.eventDefinitions || [];
  for (const def of eventDefinitions) {
    if (def.$type === 'bpmn:MessageEventDefinition') {
      return def.get('messageRef');
    }
  }
  return undefined;
}

/**
 * Eligibility for the subscription correlation key field, derived from how the
 * ZenBPM engine actually consumes the value at runtime:
 *
 *   - bpmn:IntermediateCatchEvent / bpmn:BoundaryEvent   → yes
 *     Engine creates a TokenMessageSubscription that uses the key for matching.
 *
 *   - bpmn:StartEvent inside an event sub-process only   → yes
 *     Engine creates an InstanceMessageSubscription that uses the key.
 *
 *   - bpmn:StartEvent at the process root                → no
 *     Engine creates a DefinitionMessageSubscription that ignores the key.
 *
 *   - bpmn:ReceiveTask                                   → no
 *     Not supported by the ZenBPM engine (deployment error).
 *
 *   - bpmn:EndEvent / bpmn:IntermediateThrowEvent        → no
 *     Throw events are job-based, not subscription-based.
 */
function canHaveSubscriptionCorrelationKey(element: any): boolean {
  const bo = element.businessObject;

  if (bo.$type === 'bpmn:IntermediateCatchEvent' || bo.$type === 'bpmn:BoundaryEvent') {
    return !!getMessage(element);
  }

  if (bo.$type === 'bpmn:StartEvent') {
    const parentBo = element.parent?.businessObject;
    return !!parentBo && parentBo.$type === 'bpmn:SubProcess' && !!parentBo.triggeredByEvent;
  }

  return false;
}

// ─── entry component ────────────────────────────────────────────────────────

function MessageSubscriptionCorrelationKeyEntry(props: any) {
  const { element } = props;
  const commandStack = useService('commandStack');
  const bpmnFactory  = useService('bpmnFactory');
  const translate    = useService('translate');
  const debounce     = useService('debounceInput');

  // The subscription lives on the referenced bpmn:Message, not on the
  // diagram element itself — this matches the zeebe:Subscription behaviour.
  // `message` can become undefined at render time if the user unlinks the
  // message after the entry is already mounted, so guard every access.
  const message = getMessage(element);

  const getValue = () =>
    message
      ? getFeelValue(getExtensionElement(message, TYPE)?.correlationKey)
      : '';

  const setValue = (value: string) => {
    if (!message) {
      return;
    }
    updateExtensionElementProps(
      element,
      message,
      TYPE,
      { correlationKey: value },
      bpmnFactory,
      commandStack,
    );
  };

  return FeelEntry({
    element,
    id: ID,
    label: translate('Subscription correlation key'),
    feel: 'required',
    getValue,
    setValue,
    debounce,
  });
}

// ─── exported entry list ─────────────────────────────────────────────────────

export function CorrelationKeyProps(element: any) {
  if (!canHaveSubscriptionCorrelationKey(element)) return [];
  if (!getMessage(element)) return [];

  return [
    { id: ID, component: MessageSubscriptionCorrelationKeyEntry, isEdited: isFeelEntryEdited },
  ];
}
