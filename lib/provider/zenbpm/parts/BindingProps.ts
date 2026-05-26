import { SelectEntry, TextFieldEntry, isSelectEntryEdited, isTextFieldEntryEdited } from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { getExtensionElement, updateExtensionElementProps } from '../../../util/ExtensionElementsUtil';

// ─── constants ───────────────────────────────────────────────────────────────

export const BINDING_OPTIONS = [
  { value: 'latest',     label: 'Latest' },
  { value: 'deployment', label: 'Deployment' },
  { value: 'versionTag', label: 'Version tag' },
];

// ─── entry component factories ───────────────────────────────────────────────

export function makeBindingTypeEntry(idPrefix: string, extensionType: string) {
  return function BindingTypeEntry(props: any) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory  = useService('bpmnFactory');
    const translate    = useService('translate');

    const bo = element.businessObject;

    const getValue    = () => getExtensionElement(bo, extensionType)?.bindingType ?? 'latest';
    const setValue    = (value: string) =>
      updateExtensionElementProps(element, bo, extensionType, { bindingType: value }, bpmnFactory, commandStack);
    const getOptions  = () => BINDING_OPTIONS.map(({ value, label }) => ({ value, label: translate(label) }));

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

// ─── helper ──────────────────────────────────────────────────────────────────

/**
 * Returns the binding-type select entry plus, when the current binding is
 * 'versionTag', the version-tag text-field entry.
 */
export function makeBindingEntries(idPrefix: string, extensionType: string, element: any): any[] {
  const currentBinding =
    getExtensionElement(element.businessObject, extensionType)?.bindingType ?? 'latest';

  const entries: any[] = [
    {
      id: `${idPrefix}-bindingType`,
      component: makeBindingTypeEntry(idPrefix, extensionType),
      isEdited: isSelectEntryEdited,
    },
  ];

  if (currentBinding === 'versionTag') {
    entries.push({
      id: `${idPrefix}-versionTag`,
      component: makeVersionTagEntry(idPrefix, extensionType),
      isEdited: isTextFieldEntryEdited,
    });
  }

  return entries;
}
