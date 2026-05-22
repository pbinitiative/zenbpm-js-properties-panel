import {
  TextFieldEntry,
  isTextFieldEntryEdited,
} from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { getExtensionElement, updateExtensionElementProps } from '../../../util/ExtensionElementsUtil';

function makeTextEntry(id: string, labelKey: string, prop: string) {
  return function Entry(props: any) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory  = useService('bpmnFactory');
    const translate    = useService('translate');
    const debounce     = useService('debounceInput');

    const bo = element.businessObject;

    const getValue = () => getExtensionElement(bo, 'zenbpm:AssignmentDefinition')?.[prop] ?? '';
    const setValue = (value: string) =>
      updateExtensionElementProps(element, bo, 'zenbpm:AssignmentDefinition', { [prop]: value }, bpmnFactory, commandStack);

    return TextFieldEntry({ element, id, label: translate(labelKey), getValue, setValue, debounce });
  };
}

const AssigneeEntry        = makeTextEntry('zenbpm-assign-assignee',        'Assignee',         'assignee');
const CandidateGroupsEntry = makeTextEntry('zenbpm-assign-candidateGroups', 'Candidate groups', 'candidateGroups');

export function AssignmentDefinitionProps(element: any) {
  if (element.type !== 'bpmn:UserTask') return [];

  return [
    { id: 'zenbpm-assign-assignee',        component: AssigneeEntry,        isEdited: isTextFieldEntryEdited },
    { id: 'zenbpm-assign-candidateGroups', component: CandidateGroupsEntry, isEdited: isTextFieldEntryEdited },
  ];
}
