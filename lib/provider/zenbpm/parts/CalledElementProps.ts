import {
  TextFieldEntry,
  ToggleSwitchEntry,
  isTextFieldEntryEdited,
  isToggleSwitchEntryEdited,
} from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { getExtensionElement, updateExtensionElementProps } from '../../../util/ExtensionElementsUtil';

const TYPE = 'zenbpm:CalledElement';

// ─── entry components ────────────────────────────────────────────────────────

function ProcessIdEntry(props: any) {
  const { element } = props;
  const commandStack = useService('commandStack');
  const bpmnFactory  = useService('bpmnFactory');
  const translate    = useService('translate');
  const debounce     = useService('debounceInput');

  const bo = element.businessObject;

  const getValue = () => getExtensionElement(bo, TYPE)?.processId ?? '';
  const setValue = (value: string) =>
    updateExtensionElementProps(element, bo, TYPE, { processId: value }, bpmnFactory, commandStack);

  return TextFieldEntry({
    element,
    id: 'zenbpm-calledEl-processId',
    label: translate('Process ID'),
    getValue,
    setValue,
    debounce,
  });
}

function PropagateAllChildVarsEntry(props: any) {
  const { element } = props;
  const commandStack = useService('commandStack');
  const bpmnFactory  = useService('bpmnFactory');
  const translate    = useService('translate');

  const bo = element.businessObject;

  const getValue = () => getExtensionElement(bo, TYPE)?.propagateAllChildVariables ?? false;
  const setValue = (value: boolean) =>
    updateExtensionElementProps(element, bo, TYPE, { propagateAllChildVariables: value }, bpmnFactory, commandStack);

  return ToggleSwitchEntry({
    element,
    id: 'zenbpm-calledEl-propagateAllChildVariables',
    label: translate('Propagate all child variables'),
    getValue,
    setValue,
  });
}

function PropagateAllParentVarsEntry(props: any) {
  const { element } = props;
  const commandStack = useService('commandStack');
  const bpmnFactory  = useService('bpmnFactory');
  const translate    = useService('translate');

  const bo = element.businessObject;

  const getValue = () => getExtensionElement(bo, TYPE)?.propagateAllParentVariables ?? true;
  const setValue = (value: boolean) =>
    updateExtensionElementProps(element, bo, TYPE, { propagateAllParentVariables: value }, bpmnFactory, commandStack);

  return ToggleSwitchEntry({
    element,
    id: 'zenbpm-calledEl-propagateAllParentVariables',
    label: translate('Propagate all parent variables'),
    getValue,
    setValue,
  });
}

// ─── exported entry list ─────────────────────────────────────────────────────

export function CalledElementProps(element: any) {
  if (element.type !== 'bpmn:CallActivity') return [];

  return [
    { id: 'zenbpm-calledEl-processId',                    component: ProcessIdEntry,              isEdited: isTextFieldEntryEdited    },
    { id: 'zenbpm-calledEl-propagateAllChildVariables',   component: PropagateAllChildVarsEntry,  isEdited: isToggleSwitchEntryEdited },
    { id: 'zenbpm-calledEl-propagateAllParentVariables',  component: PropagateAllParentVarsEntry, isEdited: isToggleSwitchEntryEdited },
  ];
}
