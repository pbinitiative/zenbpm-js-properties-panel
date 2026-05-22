import {
  TextFieldEntry,
  isTextFieldEntryEdited,
} from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { getExtensionElement, updateExtensionElementProps } from '../../../util/ExtensionElementsUtil';

const TYPE = 'zenbpm:CalledDecision';

function makeTextEntry(id: string, labelKey: string, prop: string) {
  return function Entry(props: any) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory  = useService('bpmnFactory');
    const translate    = useService('translate');
    const debounce     = useService('debounceInput');

    const bo = element.businessObject;

    const getValue = () => getExtensionElement(bo, TYPE)?.[prop] ?? '';
    const setValue = (value: string) =>
      updateExtensionElementProps(element, bo, TYPE, { [prop]: value }, bpmnFactory, commandStack);

    return TextFieldEntry({ element, id, label: translate(labelKey), getValue, setValue, debounce });
  };
}

const DecisionIdEntry     = makeTextEntry('zenbpm-calledDecision-decisionId',     'Decision ID',     'decisionId');
const ResultVariableEntry = makeTextEntry('zenbpm-calledDecision-resultVariable', 'Result variable', 'resultVariable');

export function CalledDecisionProps(element: any) {
  if (element.type !== 'bpmn:BusinessRuleTask') return [];

  return [
    { id: 'zenbpm-calledDecision-decisionId',     component: DecisionIdEntry,     isEdited: isTextFieldEntryEdited },
    { id: 'zenbpm-calledDecision-resultVariable', component: ResultVariableEntry, isEdited: isTextFieldEntryEdited },
  ];
}
