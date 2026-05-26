import { SelectEntry, isSelectEntryEdited } from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { getExtensionElement, switchExtensionElement } from '../../../util/ExtensionElementsUtil';

// ─── constants ───────────────────────────────────────────────────────────────

const IMPLEMENTATION_OPTIONS = [
  { value: 'dmnDecision', label: 'DMN decision' },
  { value: 'jobWorker',   label: 'Job worker' },
];

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Infer the current implementation type from extension elements:
 * - zenbpm:TaskDefinition present  → 'jobWorker'
 * - otherwise (zenbpm:CalledDecision or nothing) → 'dmnDecision'
 */
export function getImplementationType(element: any): 'dmnDecision' | 'jobWorker' {
  return getExtensionElement(element.businessObject, 'zenbpm:TaskDefinition')
    ? 'jobWorker'
    : 'dmnDecision';
}

// ─── entry component ─────────────────────────────────────────────────────────

function ImplementationEntry(props: any) {
  const { element } = props;
  const commandStack = useService('commandStack');
  const bpmnFactory  = useService('bpmnFactory');
  const translate    = useService('translate');

  const bo = element.businessObject;

  const getValue = () => getImplementationType(element);

  const setValue = (value: string) => {
    if (value === 'jobWorker') {
      switchExtensionElement(element, bo, 'zenbpm:CalledDecision', 'zenbpm:TaskDefinition', bpmnFactory, commandStack);
    } else {
      switchExtensionElement(element, bo, 'zenbpm:TaskDefinition', 'zenbpm:CalledDecision', bpmnFactory, commandStack);
    }
  };

  const getOptions = () =>
    IMPLEMENTATION_OPTIONS.map(({ value, label }) => ({ value, label: translate(label) }));

  return SelectEntry({
    element,
    id: 'zenbpm-implementation-type',
    label: translate('Implementation'),
    getValue,
    setValue,
    getOptions,
  });
}

// ─── exported entry list ─────────────────────────────────────────────────────

export function ImplementationProps(_element: any) {
  return [
    { id: 'zenbpm-implementation-type', component: ImplementationEntry, isEdited: isSelectEntryEdited },
  ];
}
