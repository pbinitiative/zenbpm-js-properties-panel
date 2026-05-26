import {
  TextFieldEntry,
  isTextFieldEntryEdited,
} from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { getExtensionElement, updateExtensionElementProps } from '../../../util/ExtensionElementsUtil';

// ─── entry component ─────────────────────────────────────────────────────────

function VersionTagEntry(props: any) {
  const { element } = props;
  const commandStack = useService('commandStack');
  const bpmnFactory  = useService('bpmnFactory');
  const translate    = useService('translate');
  const debounce     = useService('debounceInput');

  // Version tag sits on the process business object.
  // For the canvas root the bo IS the process; for a sub-process it is too.
  const bo = element.businessObject;

  const getValue = () => getExtensionElement(bo, 'zenbpm:VersionTag')?.value ?? '';
  const setValue = (value: string) =>
    updateExtensionElementProps(element, bo, 'zenbpm:VersionTag', { value }, bpmnFactory, commandStack);

  return TextFieldEntry({
    element,
    id: 'zenbpm-versionTag-value',
    label: translate('Version tag'),
    getValue,
    setValue,
    debounce,
  });
}

// ─── exported entry list ─────────────────────────────────────────────────────

export function VersionTagProps(element: any) {
  // Show only on the process root (bpmn:Process); sub-processes use their own version lifecycle
  if (element.type !== 'bpmn:Process') return [];

  return [
    { id: 'zenbpm-versionTag-value', component: VersionTagEntry, isEdited: isTextFieldEntryEdited },
  ];
}
