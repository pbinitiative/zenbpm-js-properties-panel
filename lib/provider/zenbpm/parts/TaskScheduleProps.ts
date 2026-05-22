import {
  TextFieldEntry,
  isTextFieldEntryEdited,
} from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { getExtensionElement, updateExtensionElementProps } from '../../../util/ExtensionElementsUtil';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeTextEntry(id: string, labelKey: string, prop: string) {
  return function Entry(props: any) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory  = useService('bpmnFactory');
    const translate    = useService('translate');
    const debounce     = useService('debounceInput');

    const bo = element.businessObject;

    const getValue = () => getExtensionElement(bo, 'zenbpm:TaskSchedule')?.[prop] ?? '';
    const setValue = (value: string) =>
      updateExtensionElementProps(element, bo, 'zenbpm:TaskSchedule', { [prop]: value }, bpmnFactory, commandStack);

    return TextFieldEntry({ element, id, label: translate(labelKey), getValue, setValue, debounce });
  };
}

const DueDateEntry      = makeTextEntry('zenbpm-schedule-dueDate',      'Due date',       'dueDate');
const FollowUpDateEntry = makeTextEntry('zenbpm-schedule-followUpDate', 'Follow-up date', 'followUpDate');

// ─── exported entry list ─────────────────────────────────────────────────────

export function TaskScheduleProps(element: any) {
  if (element.type !== 'bpmn:UserTask') return [];

  return [
    { id: 'zenbpm-schedule-dueDate',      component: DueDateEntry,      isEdited: isTextFieldEntryEdited },
    { id: 'zenbpm-schedule-followUpDate', component: FollowUpDateEntry, isEdited: isTextFieldEntryEdited },
  ];
}
