import { SelectEntry, TextFieldEntry, isSelectEntryEdited, isTextFieldEntryEdited } from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { getExtensionElement, updateExtensionElementProps } from '../../../util/ExtensionElementsUtil';

// ─── constants ───────────────────────────────────────────────────────────────

export const BINDING_OPTIONS = [
  { value: 'latest',     label: 'Latest' },
  { value: 'deployment', label: 'Deployment' },
  { value: 'versionTag', label: 'Version tag' },
];

export { isSelectEntryEdited, isTextFieldEntryEdited };

// ─── entry component factories ───────────────────────────────────────────────
// Call these once at module level in the consumer file to get a stable function
// reference. Never call inside getGroups / a Props function — a new reference
// each render causes Preact to unmount and remount the entry (lost focus, etc.).

export function makeBindingTypeEntry(idPrefix: string, extensionType: string) {
  return function BindingTypeEntry(props: any) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory  = useService('bpmnFactory');
    const translate    = useService('translate');

    const bo = element.businessObject;

    const getValue   = () => getExtensionElement(bo, extensionType)?.bindingType ?? 'latest';
    const setValue   = (value: string) =>
      updateExtensionElementProps(element, bo, extensionType, { bindingType: value }, bpmnFactory, commandStack);
    const getOptions = () => BINDING_OPTIONS.map(({ value, label }) => ({ value, label: translate(label) }));

    return SelectEntry({ element, id: `${idPrefix}-bindingType`, label: translate('Binding'), getValue, setValue, getOptions });
  };
}

export function makeVersionTagEntry(idPrefix: string, extensionType: string) {
  return function VersionTagEntry(props: any) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory  = useService('bpmnFactory');
    const translate    = useService('translate');
    const debounce     = useService('debounceInput');

    const bo = element.businessObject;

    const getValue = () => getExtensionElement(bo, extensionType)?.versionTag ?? '';
    const setValue = (value: string) =>
      updateExtensionElementProps(element, bo, extensionType, { versionTag: value }, bpmnFactory, commandStack);

    return TextFieldEntry({ element, id: `${idPrefix}-versionTag`, label: translate('Version tag'), getValue, setValue, debounce });
  };
}

// ─── conditional entry list helper ───────────────────────────────────────────
// Pass the pre-created (module-level) component instances so references are stable.

export function bindingEntries(
  idPrefix: string,
  bindingTypeComponent: (props: any) => any,
  versionTagComponent: (props: any) => any,
  element: any,
  extensionType: string,
): any[] {
  const currentBinding =
    getExtensionElement(element.businessObject, extensionType)?.bindingType ?? 'latest';

  const entries: any[] = [
    { id: `${idPrefix}-bindingType`, component: bindingTypeComponent, isEdited: isSelectEntryEdited },
  ];

  if (currentBinding === 'versionTag') {
    entries.push({ id: `${idPrefix}-versionTag`, component: versionTagComponent, isEdited: isTextFieldEntryEdited });
  }

  return entries;
}
