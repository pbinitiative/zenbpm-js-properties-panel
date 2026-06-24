import {
  FeelEntry,
  isFeelEntryEdited,
} from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { getExtensionElement, removeExtensionElement, updateExtensionElementProps } from '../../../util/ExtensionElementsUtil';
import { getFeelValue } from '../../../util/FeelUtil';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeFeelEntry(id: string, labelKey: string, extensionType: string, prop: string) {
  return function Entry(props: any) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');
    const debounce = useService('debounceInput');

    const bo = element.businessObject;

    const getValue = () => getFeelValue(getExtensionElement(bo, extensionType)?.[prop]);
    const setValue = (value: string) =>
      updateExtensionElementProps(element, bo, extensionType, { [prop]: value }, bpmnFactory, commandStack);

    return FeelEntry({ element, id, label: translate(labelKey), feel: 'required', getValue, setValue, debounce });
  };
}

// ─── entry components ────────────────────────────────────────────────────────

const AssigneeEntry = makeFeelEntry('zenbpm-assign-assignee', 'Assignee', 'zenbpm:AssignmentDefinition', 'assignee');
const CandidateGroupsEntry = makeFeelEntry('zenbpm-assign-candidateGroups', 'Candidate groups', 'zenbpm:AssignmentDefinition', 'candidateGroups');
const CandidateUsersEntry = makeFeelEntry('zenbpm-assign-candidateUsers', 'Candidate users', 'zenbpm:AssignmentDefinition', 'candidateUsers');
const DueDateEntry = makeFeelEntry('zenbpm-assign-dueDate', 'Due date', 'zenbpm:TaskSchedule', 'dueDate');
const FollowUpDateEntry = makeFeelEntry('zenbpm-assign-followUpDate', 'Follow-up date', 'zenbpm:TaskSchedule', 'followUpDate');

// ─── priority (FEEL-optional) ───────────────────────────────────────────────

/**
 * Read the `zenbpm:PriorityDefinition` extension element of the given element,
 * or `undefined` if none exists.
 */
export function getPriorityDefinition(element: any): any {
  return getExtensionElement(element.businessObject, 'zenbpm:PriorityDefinition');
}

function PriorityEntry(props: any) {
  const { element } = props;
  const commandStack = useService('commandStack');
  const bpmnFactory = useService('bpmnFactory');
  const translate = useService('translate');
  const debounce = useService('debounceInput');

  const bo = element.businessObject;

  const getValue = () => getExtensionElement(bo, 'zenbpm:PriorityDefinition')?.priority ?? '';

  const setValue = (value: string) => {
    const priorityDefinition = getExtensionElement(bo, 'zenbpm:PriorityDefinition');
    const isNullValue = value === null || value === '' || value === undefined;

    if (priorityDefinition && isNullValue) {
      // clear → remove the priority definition
      removeExtensionElement(element, bo, 'zenbpm:PriorityDefinition', commandStack);
    } else if (priorityDefinition && !isNullValue) {
      // update in place
      commandStack.execute('element.updateModdleProperties', {
        element,
        moddleElement: priorityDefinition,
        properties: { priority: value },
      });
    } else if (!priorityDefinition && !isNullValue) {
      // create (handles container creation atomically)
      updateExtensionElementProps(element, bo, 'zenbpm:PriorityDefinition', { priority: value }, bpmnFactory, commandStack);
    }
  };

  return FeelEntry({
    element,
    id: 'zenbpm-assign-priority',
    label: translate('Priority'),
    feel: 'optional',
    getValue,
    setValue,
    debounce,
  });
}

// ─── exported entry list ─────────────────────────────────────────────────────

export function AssignmentDefinitionProps(element: any) {
  if (element.type !== 'bpmn:UserTask') return [];

  return [
    { id: 'zenbpm-assign-assignee', component: AssigneeEntry, isEdited: isFeelEntryEdited },
    { id: 'zenbpm-assign-candidateGroups', component: CandidateGroupsEntry, isEdited: isFeelEntryEdited },
    { id: 'zenbpm-assign-candidateUsers', component: CandidateUsersEntry, isEdited: isFeelEntryEdited },
    { id: 'zenbpm-assign-dueDate', component: DueDateEntry, isEdited: isFeelEntryEdited },
    { id: 'zenbpm-assign-followUpDate', component: FollowUpDateEntry, isEdited: isFeelEntryEdited },
    { id: 'zenbpm-assign-priority', component: PriorityEntry, isEdited: isFeelEntryEdited },
  ];
}
