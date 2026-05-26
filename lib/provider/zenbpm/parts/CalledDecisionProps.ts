import {
  TextFieldEntry,
  isTextFieldEntryEdited,
} from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { getExtensionElement, updateExtensionElementProps } from '../../../util/ExtensionElementsUtil';
import { makeBindingTypeEntry, makeVersionTagEntry, bindingEntries } from './BindingProps';

const TYPE = 'zenbpm:CalledDecision';
const ID   = 'zenbpm-calledDecision';

// Module-level component instances — stable references, never recreated on render.
const BindingTypeEntry = makeBindingTypeEntry(ID, TYPE);
const BindingVersionTagEntry = makeVersionTagEntry(ID, TYPE);

// ─── entry components ────────────────────────────────────────────────────────

function DecisionIdEntry(props: any) {
  const { element } = props;
  const commandStack = useService('commandStack');
  const bpmnFactory  = useService('bpmnFactory');
  const translate    = useService('translate');
  const debounce     = useService('debounceInput');

  const bo = element.businessObject;

  const getValue = () => getExtensionElement(bo, TYPE)?.decisionId ?? '';
  const setValue = (value: string) =>
    updateExtensionElementProps(element, bo, TYPE, { decisionId: value }, bpmnFactory, commandStack);

  return TextFieldEntry({ element, id: `${ID}-decisionId`, label: translate('Decision ID'), getValue, setValue, debounce });
}

function ResultVariableEntry(props: any) {
  const { element } = props;
  const commandStack = useService('commandStack');
  const bpmnFactory  = useService('bpmnFactory');
  const translate    = useService('translate');
  const debounce     = useService('debounceInput');

  const bo = element.businessObject;

  const getValue = () => getExtensionElement(bo, TYPE)?.resultVariable ?? '';
  const setValue = (value: string) =>
    updateExtensionElementProps(element, bo, TYPE, { resultVariable: value }, bpmnFactory, commandStack);

  return TextFieldEntry({ element, id: `${ID}-resultVariable`, label: translate('Result variable'), getValue, setValue, debounce });
}

// ─── exported entry list ─────────────────────────────────────────────────────

export function CalledDecisionProps(element: any) {
  if (element.type !== 'bpmn:BusinessRuleTask') return [];

  return [
    { id: `${ID}-decisionId`,     component: DecisionIdEntry,     isEdited: isTextFieldEntryEdited },
    ...bindingEntries(ID, BindingTypeEntry, BindingVersionTagEntry, element, TYPE),
    { id: `${ID}-resultVariable`, component: ResultVariableEntry, isEdited: isTextFieldEntryEdited },
  ];
}
