import {
  TextFieldEntry,
  isTextFieldEntryEdited,
} from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { getExtensionElement, updateExtensionElementProps } from '../../../util/ExtensionElementsUtil';

// bpmn:ServiceTask, bpmn:BusinessRuleTask, bpmn:ScriptTask, bpmn:SendTask all
// use zenbpm:TaskDefinition to declare the job worker type & retry count.
const SERVICE_TASK_TYPES = new Set([
  'bpmn:ServiceTask',
  'bpmn:BusinessRuleTask',
  'bpmn:ScriptTask',
  'bpmn:SendTask',
]);

export function isServiceTaskLike(element: any): boolean {
  return SERVICE_TASK_TYPES.has(element.type);
}

// ─── entry components ────────────────────────────────────────────────────────

function TypeEntry(props: any) {
  const { element } = props;
  const commandStack = useService('commandStack');
  const bpmnFactory  = useService('bpmnFactory');
  const translate    = useService('translate');
  const debounce     = useService('debounceInput');

  const bo = element.businessObject;

  const getValue = () => getExtensionElement(bo, 'zenbpm:TaskDefinition')?.type ?? '';

  const setValue = (value: string) =>
    updateExtensionElementProps(element, bo, 'zenbpm:TaskDefinition', { type: value }, bpmnFactory, commandStack);

  return TextFieldEntry({ element, id: 'zenbpm-taskDef-type', label: translate('Type'), getValue, setValue, debounce });
}

function RetriesEntry(props: any) {
  const { element } = props;
  const commandStack = useService('commandStack');
  const bpmnFactory  = useService('bpmnFactory');
  const translate    = useService('translate');
  const debounce     = useService('debounceInput');

  const bo = element.businessObject;

  const getValue = () => getExtensionElement(bo, 'zenbpm:TaskDefinition')?.retries ?? '';

  const setValue = (value: string) =>
    updateExtensionElementProps(element, bo, 'zenbpm:TaskDefinition', { retries: value }, bpmnFactory, commandStack);

  return TextFieldEntry({ element, id: 'zenbpm-taskDef-retries', label: translate('Retries'), getValue, setValue, debounce });
}

// ─── exported entry list ─────────────────────────────────────────────────────

export function TaskDefinitionProps(element: any) {
  if (!isServiceTaskLike(element)) return [];

  return [
    { id: 'zenbpm-taskDef-type',    component: TypeEntry,    isEdited: isTextFieldEntryEdited },
    { id: 'zenbpm-taskDef-retries', component: RetriesEntry, isEdited: isTextFieldEntryEdited },
  ];
}
