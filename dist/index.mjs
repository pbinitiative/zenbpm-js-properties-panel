import { isTextFieldEntryEdited, TextFieldEntry, isFeelEntryEdited, FeelEntry, isSelectEntryEdited, SelectEntry, isToggleSwitchEntryEdited, ToggleSwitchEntry, ListGroup, Group } from '@bpmn-io/properties-panel';
import { createElement } from '@bpmn-io/properties-panel/preact';
import { useService } from 'bpmn-js-properties-panel';

function ZenFormProps(element) {
    if (element.type !== 'bpmn:UserTask') {
        return [];
    }
    return [
        {
            id: 'zenFormDesignButton',
            component: ZenFormDesignButtonEntry,
            isEdited: () => false,
        }
    ];
}
function getZenFormValue(element) {
    const bo = element.businessObject;
    const extensionElements = bo.extensionElements;
    if (!extensionElements)
        return '';
    const ioMapping = extensionElements.values?.find((e) => e.$type === 'zenbpm:IoMapping');
    if (!ioMapping)
        return '';
    const input = (ioMapping.inputParameters || []).find((p) => p.target === 'ZEN_FORM');
    if (!input?.source)
        return '';
    // Parse FEEL string literal: ="..." → raw JSON
    const src = input.source;
    if (src.startsWith('="') && src.endsWith('"')) {
        return src.slice(2, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    return src;
}
function ZenFormDesignButtonEntry(props) {
    const { element } = props;
    const translate = useService('translate');
    const handleClick = () => {
        const currentValue = getZenFormValue(element);
        document.dispatchEvent(new CustomEvent('bpmn-open-form-designer', {
            detail: { elementId: element.id, value: currentValue },
        }));
    };
    return createElement('div', { class: 'bio-properties-panel-entry', style: 'padding: 0 10px 6px' }, createElement('button', {
        type: 'button',
        onClick: handleClick,
        style: 'width: 100%; padding: 6px 12px; cursor: pointer; ' +
            'background: #4d90fe; color: white; border: none; border-radius: 3px; ' +
            'font-size: 13px; font-weight: 500;',
    }, translate('Design Form')));
}

/**
 * Return the first extension element of `type` from the given business object,
 * or undefined if none exists.
 */
function getExtensionElement(bo, type) {
    const ext = bo.extensionElements;
    if (!ext)
        return undefined;
    return (ext.values || []).find((e) => e.$instanceOf(type));
}
/**
 * Update properties on an existing extension element, or create a new one
 * inside bpmn:ExtensionElements if it does not yet exist.
 *
 * Uses `properties-panel.multi-command-executor` so all mutations land as
 * a single undo-able step.
 */
function updateExtensionElementProps(element, bo, type, props, bpmnFactory, commandStack) {
    const commands = [];
    let extensionElements = bo.extensionElements;
    // (1) create bpmn:ExtensionElements container if missing
    if (!extensionElements) {
        extensionElements = bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
        extensionElements.$parent = bo;
        commands.push({
            cmd: 'element.updateModdleProperties',
            context: { element, moddleElement: bo, properties: { extensionElements } },
        });
    }
    const existing = (extensionElements.values || []).find((e) => e.$instanceOf(type));
    if (existing) {
        // (2a) update properties on the existing element
        commands.push({
            cmd: 'element.updateModdleProperties',
            context: { element, moddleElement: existing, properties: props },
        });
    }
    else {
        // (2b) create and attach a new extension element
        const created = bpmnFactory.create(type, props);
        created.$parent = extensionElements;
        commands.push({
            cmd: 'element.updateModdleProperties',
            context: {
                element,
                moddleElement: extensionElements,
                properties: { values: [...(extensionElements.values || []), created] },
            },
        });
    }
    commandStack.execute('properties-panel.multi-command-executor', commands);
}

// bpmn:ServiceTask, bpmn:BusinessRuleTask, bpmn:ScriptTask, bpmn:SendTask all
// use zenbpm:TaskDefinition to declare the job worker type & retry count.
const SERVICE_TASK_TYPES = new Set([
    'bpmn:ServiceTask',
    'bpmn:BusinessRuleTask',
    'bpmn:ScriptTask',
    'bpmn:SendTask',
]);
function isServiceTaskLike(element) {
    return SERVICE_TASK_TYPES.has(element.type);
}
// ─── entry components ────────────────────────────────────────────────────────
function TypeEntry(props) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');
    const debounce = useService('debounceInput');
    const bo = element.businessObject;
    const getValue = () => getExtensionElement(bo, 'zenbpm:TaskDefinition')?.type ?? '';
    const setValue = (value) => updateExtensionElementProps(element, bo, 'zenbpm:TaskDefinition', { type: value }, bpmnFactory, commandStack);
    return TextFieldEntry({ element, id: 'zenbpm-taskDef-type', label: translate('Type'), getValue, setValue, debounce });
}
function RetriesEntry(props) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');
    const debounce = useService('debounceInput');
    const bo = element.businessObject;
    const getValue = () => getExtensionElement(bo, 'zenbpm:TaskDefinition')?.retries ?? '';
    const setValue = (value) => updateExtensionElementProps(element, bo, 'zenbpm:TaskDefinition', { retries: value }, bpmnFactory, commandStack);
    return TextFieldEntry({ element, id: 'zenbpm-taskDef-retries', label: translate('Retries'), getValue, setValue, debounce });
}
// ─── exported entry list ─────────────────────────────────────────────────────
function TaskDefinitionProps(element) {
    if (!isServiceTaskLike(element))
        return [];
    return [
        { id: 'zenbpm-taskDef-type', component: TypeEntry, isEdited: isTextFieldEntryEdited },
        { id: 'zenbpm-taskDef-retries', component: RetriesEntry, isEdited: isTextFieldEntryEdited },
    ];
}

/**
 * Normalise a raw stored value for display inside a `FeelEntry` with
 * `feel: 'required'`.
 *
 * `FeelEntry` expects values to carry the `=` prefix that marks them as FEEL
 * expressions (e.g. `=myVariable`, `=[1,2,3]`).  Older data saved without
 * the prefix is transparently upgraded on read so the editor shows it
 * correctly, and the next save will persist the `=`.
 *
 * @example
 *   // In a FeelEntry getValue:
 *   const getValue = () => getFeelValue(param.source);
 */
function getFeelValue(stored) {
    if (!stored)
        return '';
    return stored.startsWith('=') ? stored : '=' + stored;
}
/**
 * Read the FEEL body from a `bpmn:FormalExpression` element.
 * Returns an empty string when the expression does not exist yet.
 */
function getFormalExpressionValue(expression) {
    return expression?.body ?? '';
}
/**
 * Create, update, or remove a `bpmn:FormalExpression` child property.
 *
 * - When `value` is empty the property is cleared (`undefined`).
 * - When the expression already exists its `body` is updated in-place.
 * - Otherwise a new `bpmn:FormalExpression` is created and attached.
 *
 * @param element        The diagram element (needed by the command stack).
 * @param moddleElement  The parent moddle object that owns the expression.
 * @param prop           Property name on `moddleElement` (e.g. `'conditionExpression'`).
 * @param value          New FEEL body value coming from `FeelEntry`.
 * @param bpmnFactory    Injected bpmn factory.
 * @param commandStack   Injected command stack.
 */
function setFormalExpression(element, moddleElement, prop, value, bpmnFactory, commandStack) {
    if (!value) {
        commandStack.execute('element.updateModdleProperties', {
            element,
            moddleElement,
            properties: { [prop]: undefined },
        });
    }
    else if (moddleElement[prop]) {
        commandStack.execute('element.updateModdleProperties', {
            element,
            moddleElement: moddleElement[prop],
            properties: { body: value },
        });
    }
    else {
        const expr = bpmnFactory.create('bpmn:FormalExpression', { body: value });
        commandStack.execute('element.updateModdleProperties', {
            element,
            moddleElement,
            properties: { [prop]: expr },
        });
    }
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function makeFeelEntry(id, labelKey, extensionType, prop) {
    return function Entry(props) {
        const { element } = props;
        const commandStack = useService('commandStack');
        const bpmnFactory = useService('bpmnFactory');
        const translate = useService('translate');
        const debounce = useService('debounceInput');
        const bo = element.businessObject;
        const getValue = () => getFeelValue(getExtensionElement(bo, extensionType)?.[prop]);
        const setValue = (value) => updateExtensionElementProps(element, bo, extensionType, { [prop]: value }, bpmnFactory, commandStack);
        return FeelEntry({ element, id, label: translate(labelKey), feel: 'required', getValue, setValue, debounce });
    };
}
// ─── entry components ────────────────────────────────────────────────────────
const AssigneeEntry = makeFeelEntry('zenbpm-assign-assignee', 'Assignee', 'zenbpm:AssignmentDefinition', 'assignee');
const CandidateGroupsEntry = makeFeelEntry('zenbpm-assign-candidateGroups', 'Candidate groups', 'zenbpm:AssignmentDefinition', 'candidateGroups');
const CandidateUsersEntry = makeFeelEntry('zenbpm-assign-candidateUsers', 'Candidate users', 'zenbpm:AssignmentDefinition', 'candidateUsers');
const DueDateEntry = makeFeelEntry('zenbpm-assign-dueDate', 'Due date', 'zenbpm:TaskSchedule', 'dueDate');
const FollowUpDateEntry = makeFeelEntry('zenbpm-assign-followUpDate', 'Follow-up date', 'zenbpm:TaskSchedule', 'followUpDate');
// ─── exported entry list ─────────────────────────────────────────────────────
function AssignmentDefinitionProps(element) {
    if (element.type !== 'bpmn:UserTask')
        return [];
    return [
        { id: 'zenbpm-assign-assignee', component: AssigneeEntry, isEdited: isFeelEntryEdited },
        { id: 'zenbpm-assign-candidateGroups', component: CandidateGroupsEntry, isEdited: isFeelEntryEdited },
        { id: 'zenbpm-assign-candidateUsers', component: CandidateUsersEntry, isEdited: isFeelEntryEdited },
        { id: 'zenbpm-assign-dueDate', component: DueDateEntry, isEdited: isFeelEntryEdited },
        { id: 'zenbpm-assign-followUpDate', component: FollowUpDateEntry, isEdited: isFeelEntryEdited },
    ];
}

// ─── constants ───────────────────────────────────────────────────────────────
const BINDING_OPTIONS = [
    { value: 'latest', label: 'Latest' },
    { value: 'deployment', label: 'Deployment' },
    { value: 'versionTag', label: 'Version tag' },
];
// ─── entry component factories ───────────────────────────────────────────────
function makeBindingTypeEntry(idPrefix, extensionType) {
    return function BindingTypeEntry(props) {
        const { element } = props;
        const commandStack = useService('commandStack');
        const bpmnFactory = useService('bpmnFactory');
        const translate = useService('translate');
        const bo = element.businessObject;
        const getValue = () => getExtensionElement(bo, extensionType)?.bindingType ?? 'latest';
        const setValue = (value) => updateExtensionElementProps(element, bo, extensionType, { bindingType: value }, bpmnFactory, commandStack);
        const getOptions = () => BINDING_OPTIONS.map(({ value, label }) => ({ value, label: translate(label) }));
        return SelectEntry({ element, id: `${idPrefix}-bindingType`, label: translate('Binding'), getValue, setValue, getOptions });
    };
}
function makeVersionTagEntry(idPrefix, extensionType) {
    return function VersionTagEntry(props) {
        const { element } = props;
        const commandStack = useService('commandStack');
        const bpmnFactory = useService('bpmnFactory');
        const translate = useService('translate');
        const debounce = useService('debounceInput');
        const bo = element.businessObject;
        const getValue = () => getExtensionElement(bo, extensionType)?.versionTag ?? '';
        const setValue = (value) => updateExtensionElementProps(element, bo, extensionType, { versionTag: value }, bpmnFactory, commandStack);
        return TextFieldEntry({ element, id: `${idPrefix}-versionTag`, label: translate('Version tag'), getValue, setValue, debounce });
    };
}
// ─── helper ──────────────────────────────────────────────────────────────────
/**
 * Returns the binding-type select entry plus, when the current binding is
 * 'versionTag', the version-tag text-field entry.
 */
function makeBindingEntries(idPrefix, extensionType, element) {
    const currentBinding = getExtensionElement(element.businessObject, extensionType)?.bindingType ?? 'latest';
    const entries = [
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

const TYPE$2 = 'zenbpm:CalledElement';
const ID$1 = 'zenbpm-calledEl';
// ─── entry components ────────────────────────────────────────────────────────
function ProcessIdEntry(props) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');
    const debounce = useService('debounceInput');
    const bo = element.businessObject;
    const getValue = () => getExtensionElement(bo, TYPE$2)?.processId ?? '';
    const setValue = (value) => updateExtensionElementProps(element, bo, TYPE$2, { processId: value }, bpmnFactory, commandStack);
    return TextFieldEntry({ element, id: `${ID$1}-processId`, label: translate('Process ID'), getValue, setValue, debounce });
}
function PropagateAllChildVarsEntry(props) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');
    const bo = element.businessObject;
    const getValue = () => getExtensionElement(bo, TYPE$2)?.propagateAllChildVariables ?? false;
    const setValue = (value) => updateExtensionElementProps(element, bo, TYPE$2, { propagateAllChildVariables: value }, bpmnFactory, commandStack);
    return ToggleSwitchEntry({ element, id: `${ID$1}-propagateAllChildVariables`, label: translate('Propagate all child variables'), getValue, setValue });
}
function PropagateAllParentVarsEntry(props) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');
    const bo = element.businessObject;
    const getValue = () => getExtensionElement(bo, TYPE$2)?.propagateAllParentVariables ?? true;
    const setValue = (value) => updateExtensionElementProps(element, bo, TYPE$2, { propagateAllParentVariables: value }, bpmnFactory, commandStack);
    return ToggleSwitchEntry({ element, id: `${ID$1}-propagateAllParentVariables`, label: translate('Propagate all parent variables'), getValue, setValue });
}
// ─── exported entry list ─────────────────────────────────────────────────────
function CalledElementProps(element) {
    if (element.type !== 'bpmn:CallActivity')
        return [];
    return [
        { id: `${ID$1}-processId`, component: ProcessIdEntry, isEdited: isTextFieldEntryEdited },
        ...makeBindingEntries(ID$1, TYPE$2, element),
        { id: `${ID$1}-propagateAllChildVariables`, component: PropagateAllChildVarsEntry, isEdited: isToggleSwitchEntryEdited },
        { id: `${ID$1}-propagateAllParentVariables`, component: PropagateAllParentVarsEntry, isEdited: isToggleSwitchEntryEdited },
    ];
}

const TYPE$1 = 'zenbpm:CalledDecision';
const ID = 'zenbpm-calledDecision';
// ─── entry components ────────────────────────────────────────────────────────
function DecisionIdEntry(props) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');
    const debounce = useService('debounceInput');
    const bo = element.businessObject;
    const getValue = () => getExtensionElement(bo, TYPE$1)?.decisionId ?? '';
    const setValue = (value) => updateExtensionElementProps(element, bo, TYPE$1, { decisionId: value }, bpmnFactory, commandStack);
    return TextFieldEntry({ element, id: `${ID}-decisionId`, label: translate('Decision ID'), getValue, setValue, debounce });
}
function ResultVariableEntry(props) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');
    const debounce = useService('debounceInput');
    const bo = element.businessObject;
    const getValue = () => getExtensionElement(bo, TYPE$1)?.resultVariable ?? '';
    const setValue = (value) => updateExtensionElementProps(element, bo, TYPE$1, { resultVariable: value }, bpmnFactory, commandStack);
    return TextFieldEntry({ element, id: `${ID}-resultVariable`, label: translate('Result variable'), getValue, setValue, debounce });
}
// ─── exported entry list ─────────────────────────────────────────────────────
function CalledDecisionProps(element) {
    if (element.type !== 'bpmn:BusinessRuleTask')
        return [];
    return [
        { id: `${ID}-decisionId`, component: DecisionIdEntry, isEdited: isTextFieldEntryEdited },
        ...makeBindingEntries(ID, TYPE$1, element),
        { id: `${ID}-resultVariable`, component: ResultVariableEntry, isEdited: isTextFieldEntryEdited },
    ];
}

// ─── entry component ─────────────────────────────────────────────────────────
function VersionTagEntry(props) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');
    const debounce = useService('debounceInput');
    // Version tag sits on the process business object.
    // For the canvas root the bo IS the process; for a sub-process it is too.
    const bo = element.businessObject;
    const getValue = () => getExtensionElement(bo, 'zenbpm:VersionTag')?.value ?? '';
    const setValue = (value) => updateExtensionElementProps(element, bo, 'zenbpm:VersionTag', { value }, bpmnFactory, commandStack);
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
function VersionTagProps(element) {
    // Show on the process root (bpmn:Process) and on sub-processes
    if (element.type !== 'bpmn:Process')
        return [];
    return [
        { id: 'zenbpm-versionTag-value', component: VersionTagEntry, isEdited: isTextFieldEntryEdited },
    ];
}

const TYPE = 'zenbpm:LoopCharacteristics';
// ─── helpers ─────────────────────────────────────────────────────────────────
/**
 * Return the bpmn:MultiInstanceLoopCharacteristics of an element, or null.
 */
function getMultiInstanceLoopCharacteristics(element) {
    const lc = element.businessObject?.loopCharacteristics;
    if (!lc || !lc.$instanceOf('bpmn:MultiInstanceLoopCharacteristics'))
        return null;
    return lc;
}
function getZenbpmLoopCharacteristics(element) {
    const lc = getMultiInstanceLoopCharacteristics(element);
    return lc ? getExtensionElement(lc, TYPE) : undefined;
}
// ─── entry components ────────────────────────────────────────────────────────
/**
 * FEEL expression — the collection to iterate over (e.g. `= items`)
 */
function InputCollectionEntry(props) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');
    const debounce = useService('debounceInput');
    const lc = getMultiInstanceLoopCharacteristics(element);
    const getValue = () => getZenbpmLoopCharacteristics(element)?.inputCollection ?? '';
    const setValue = (value) => updateExtensionElementProps(element, lc, TYPE, { inputCollection: value }, bpmnFactory, commandStack);
    return FeelEntry({
        element,
        id: 'zenbpm-multiInstance-inputCollection',
        label: translate('Input collection'),
        feel: 'required',
        getValue,
        setValue,
        debounce,
    });
}
/**
 * Plain variable name — what each iteration element is called (e.g. `item`)
 */
function InputElementEntry(props) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');
    const debounce = useService('debounceInput');
    const lc = getMultiInstanceLoopCharacteristics(element);
    const getValue = () => getZenbpmLoopCharacteristics(element)?.inputElement ?? '';
    const setValue = (value) => updateExtensionElementProps(element, lc, TYPE, { inputElement: value }, bpmnFactory, commandStack);
    return TextFieldEntry({
        element,
        id: 'zenbpm-multiInstance-inputElement',
        label: translate('Input element'),
        getValue,
        setValue,
        debounce,
    });
}
/**
 * Plain variable name — where to collect the results (e.g. `results`)
 */
function OutputCollectionEntry(props) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');
    const debounce = useService('debounceInput');
    const lc = getMultiInstanceLoopCharacteristics(element);
    const getValue = () => getZenbpmLoopCharacteristics(element)?.outputCollection ?? '';
    const setValue = (value) => updateExtensionElementProps(element, lc, TYPE, { outputCollection: value }, bpmnFactory, commandStack);
    return TextFieldEntry({
        element,
        id: 'zenbpm-multiInstance-outputCollection',
        label: translate('Output collection'),
        getValue,
        setValue,
        debounce,
    });
}
/**
 * FEEL expression — the value contributed to the output collection by each iteration
 */
function OutputElementEntry(props) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');
    const debounce = useService('debounceInput');
    const lc = getMultiInstanceLoopCharacteristics(element);
    const getValue = () => getZenbpmLoopCharacteristics(element)?.outputElement ?? '';
    const setValue = (value) => updateExtensionElementProps(element, lc, TYPE, { outputElement: value }, bpmnFactory, commandStack);
    return FeelEntry({
        element,
        id: 'zenbpm-multiInstance-outputElement',
        label: translate('Output element'),
        feel: 'required',
        getValue,
        setValue,
        debounce,
    });
}
function CompletionConditionEntry(props) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');
    const debounce = useService('debounceInput');
    const lc = getMultiInstanceLoopCharacteristics(element);
    const getValue = () => getFormalExpressionValue(lc.completionCondition);
    const setValue = (value) => setFormalExpression(element, lc, 'completionCondition', value, bpmnFactory, commandStack);
    return FeelEntry({
        element,
        id: 'zenbpm-multiInstance-completionCondition',
        label: translate('Completion condition'),
        feel: 'required',
        getValue,
        setValue,
        debounce,
    });
}
// ─── exported entry list ─────────────────────────────────────────────────────
function MultiInstanceProps(element) {
    if (!getMultiInstanceLoopCharacteristics(element))
        return [];
    return [
        { id: 'zenbpm-multiInstance-inputCollection', component: InputCollectionEntry, isEdited: isFeelEntryEdited },
        { id: 'zenbpm-multiInstance-inputElement', component: InputElementEntry, isEdited: isTextFieldEntryEdited },
        { id: 'zenbpm-multiInstance-outputCollection', component: OutputCollectionEntry, isEdited: isTextFieldEntryEdited },
        { id: 'zenbpm-multiInstance-outputElement', component: OutputElementEntry, isEdited: isFeelEntryEdited },
        { id: 'zenbpm-multiInstance-completionCondition', component: CompletionConditionEntry, isEdited: isFeelEntryEdited },
    ];
}

const IO_ELEMENTS = new Set([
    'bpmn:ServiceTask', 'bpmn:BusinessRuleTask', 'bpmn:SendTask', 'bpmn:ScriptTask',
    'bpmn:UserTask', 'bpmn:SubProcess', 'bpmn:CallActivity',
    'bpmn:EndEvent', 'bpmn:IntermediateCatchEvent', 'bpmn:IntermediateThrowEvent',
]);
const OUTPUT_ONLY_ELEMENTS = new Set([
    'bpmn:StartEvent',
    'bpmn:BoundaryEvent',
]);
function supportsInputMapping(element) {
    return IO_ELEMENTS.has(element.type);
}
function supportsOutputMapping(element) {
    return IO_ELEMENTS.has(element.type) || OUTPUT_ONLY_ELEMENTS.has(element.type);
}
function makeParamEntry(id, labelKey, prop, element, param) {
    return function ParamEntry(_props) {
        const commandStack = useService('commandStack');
        const translate = useService('translate');
        const debounce = useService('debounceInput');
        const getValue = () => prop === 'source' ? getFeelValue(param[prop]) : (param[prop] || '');
        const setValue = (value) => commandStack.execute('element.updateModdleProperties', {
            element,
            moddleElement: param,
            properties: { [prop]: value },
        });
        return prop === 'source'
            ? FeelEntry({ element, id, label: translate(labelKey), feel: 'required', getValue, setValue, debounce })
            : TextFieldEntry({ element, id, label: translate(labelKey), getValue, setValue, debounce });
    };
}
function addParam(element, bo, bpmnFactory, commandStack, paramType, listProp) {
    const commands = [];
    let extensionElements = bo.extensionElements;
    if (!extensionElements) {
        extensionElements = bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
        extensionElements.$parent = bo;
        commands.push({ cmd: 'element.updateModdleProperties', context: { element, moddleElement: bo, properties: { extensionElements } } });
    }
    let ioMapping = (extensionElements.values || []).find((e) => e.$instanceOf('zenbpm:IoMapping'));
    if (!ioMapping) {
        ioMapping = bpmnFactory.create('zenbpm:IoMapping', { inputParameters: [], outputParameters: [] });
        ioMapping.$parent = extensionElements;
        commands.push({ cmd: 'element.updateModdleProperties', context: { element, moddleElement: extensionElements, properties: { values: [...(extensionElements.values || []), ioMapping] } } });
    }
    const newParam = bpmnFactory.create(paramType, { source: '', target: '' });
    newParam.$parent = ioMapping;
    commands.push({ cmd: 'element.updateModdleProperties', context: { element, moddleElement: ioMapping, properties: { [listProp]: [...(ioMapping[listProp] || []), newParam] } } });
    commandStack.execute('properties-panel.multi-command-executor', commands);
}
function removeParam(element, ioMapping, param, listProp, commandStack) {
    commandStack.execute('element.updateModdleProperties', {
        element,
        moddleElement: ioMapping,
        properties: { [listProp]: (ioMapping[listProp] || []).filter((p) => p !== param) },
    });
}
function createInputMappingGroup(element, injector) {
    if (!supportsInputMapping(element))
        return null;
    const commandStack = injector.get('commandStack');
    const bpmnFactory = injector.get('bpmnFactory');
    const translate = injector.get('translate');
    const eventBus = injector.get('eventBus');
    const bo = element.businessObject;
    const ioMapping = getExtensionElement(bo, 'zenbpm:IoMapping');
    const inputs = ioMapping?.inputParameters || [];
    const items = inputs.map((input, index) => {
        const id = `${element.id}-zenbpm-input-${index}`;
        return {
            id,
            label: input.target || translate('<empty>'),
            entries: [
                { id: `${id}-source`, component: makeParamEntry(`${id}-source`, 'Source expression', 'source', element, input), isEdited: isFeelEntryEdited },
                { id: `${id}-target`, component: makeParamEntry(`${id}-target`, 'Target variable', 'target', element, input), isEdited: isTextFieldEntryEdited },
            ],
            autoFocusEntry: `${id}-target`,
            remove: () => removeParam(element, ioMapping, input, 'inputParameters', commandStack),
        };
    });
    return {
        id: 'zenbpm-ioMapping-inputs',
        label: translate('Input mapping'),
        component: ListGroup,
        items,
        add: () => {
            addParam(element, bo, bpmnFactory, commandStack, 'zenbpm:Input', 'inputParameters');
            const newId = `${element.id}-zenbpm-input-${inputs.length}`;
            setTimeout(() => eventBus.fire('propertiesPanel.showEntry', { id: `${newId}-target` }), 0);
        },
    };
}
function createOutputMappingGroup(element, injector) {
    if (!supportsOutputMapping(element))
        return null;
    const commandStack = injector.get('commandStack');
    const bpmnFactory = injector.get('bpmnFactory');
    const translate = injector.get('translate');
    const eventBus = injector.get('eventBus');
    const bo = element.businessObject;
    const ioMapping = getExtensionElement(bo, 'zenbpm:IoMapping');
    const outputs = ioMapping?.outputParameters || [];
    const items = outputs.map((output, index) => {
        const id = `${element.id}-zenbpm-output-${index}`;
        return {
            id,
            label: output.target || translate('<empty>'),
            entries: [
                { id: `${id}-source`, component: makeParamEntry(`${id}-source`, 'Source expression', 'source', element, output), isEdited: isFeelEntryEdited },
                { id: `${id}-target`, component: makeParamEntry(`${id}-target`, 'Target variable', 'target', element, output), isEdited: isTextFieldEntryEdited },
            ],
            autoFocusEntry: `${id}-target`,
            remove: () => removeParam(element, ioMapping, output, 'outputParameters', commandStack),
        };
    });
    return {
        id: 'zenbpm-ioMapping-outputs',
        label: translate('Output mapping'),
        component: ListGroup,
        items,
        add: () => {
            addParam(element, bo, bpmnFactory, commandStack, 'zenbpm:Output', 'outputParameters');
            const newId = `${element.id}-zenbpm-output-${outputs.length}`;
            setTimeout(() => eventBus.fire('propertiesPanel.showEntry', { id: `${newId}-target` }), 0);
        },
    };
}

function ConditionExpressionEntry(props) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');
    const debounce = useService('debounceInput');
    const bo = element.businessObject;
    const getValue = () => getFormalExpressionValue(bo.conditionExpression);
    const setValue = (value) => setFormalExpression(element, bo, 'conditionExpression', value, bpmnFactory, commandStack);
    return FeelEntry({
        element,
        id: 'zenbpm-conditionExpression',
        label: translate('Condition expression'),
        feel: 'required',
        getValue,
        setValue,
        debounce,
    });
}
function ConditionExpressionProps(element) {
    if (element.type !== 'bpmn:SequenceFlow')
        return [];
    return [
        { id: 'zenbpm-conditionExpression', component: ConditionExpressionEntry, isEdited: isFeelEntryEdited },
    ];
}

const PROVIDER_PRIORITY = 500;
class ZenBpmPropertiesProvider {
    static $inject = ['propertiesPanel', 'injector'];
    _injector;
    constructor(propertiesPanel, injector) {
        this._injector = injector;
        propertiesPanel.registerProvider(PROVIDER_PRIORITY, this);
    }
    getGroups(element) {
        return (groups) => {
            const translate = this._injector.get('translate');
            // ── Task Definition ──────────────────────────────────────────────────
            if (isServiceTaskLike(element)) {
                groups.push({
                    id: 'zenbpm-taskDefinition',
                    label: translate('Task definition'),
                    entries: TaskDefinitionProps(element),
                    component: Group,
                });
            }
            // ── Called Decision ──────────────────────────────────────────────────
            if (element.type === 'bpmn:BusinessRuleTask') {
                groups.push({
                    id: 'zenbpm-calledDecision',
                    label: translate('Called decision'),
                    entries: CalledDecisionProps(element),
                    component: Group,
                });
            }
            // ── Called Element ───────────────────────────────────────────────────
            if (element.type === 'bpmn:CallActivity') {
                groups.push({
                    id: 'zenbpm-calledElement',
                    label: translate('Called element'),
                    entries: CalledElementProps(element),
                    component: Group,
                });
            }
            // ── Assignment Definition ────────────────────────────────────────────
            if (element.type === 'bpmn:UserTask') {
                groups.push({
                    id: 'zenbpm-assignmentDefinition',
                    label: translate('Assignment'),
                    entries: AssignmentDefinitionProps(element),
                    component: Group,
                });
            }
            // ── Input mapping ────────────────────────────────────────────────────
            const inputGroup = createInputMappingGroup(element, this._injector);
            if (inputGroup)
                groups.push(inputGroup);
            // ── Output mapping ───────────────────────────────────────────────────
            const outputGroup = createOutputMappingGroup(element, this._injector);
            if (outputGroup)
                groups.push(outputGroup);
            // ── Multi-Instance ───────────────────────────────────────────────────
            const multiInstanceEntries = MultiInstanceProps(element);
            if (multiInstanceEntries.length) {
                const existingGroup = groups.find((g) => g.id === 'multiInstance');
                if (existingGroup) {
                    existingGroup.entries = [...existingGroup.entries, ...multiInstanceEntries];
                }
                else {
                    groups.push({
                        id: 'multiInstance',
                        label: translate('Multi-instance'),
                        entries: multiInstanceEntries,
                        component: Group,
                    });
                }
            }
            // ── Condition expression ─────────────────────────────────────────────
            const conditionEntries = ConditionExpressionProps(element);
            if (conditionEntries.length) {
                const conditionGroup = groups.find((g) => g.id === 'condition');
                if (conditionGroup) {
                    conditionGroup.entries = [...conditionGroup.entries, ...conditionEntries];
                }
                else {
                    groups.push({
                        id: 'zenbpm-condition',
                        label: translate('Condition'),
                        entries: conditionEntries,
                        component: Group,
                    });
                }
            }
            // ── Version Tag (appended to General) ───────────────────────────────
            const versionTagEntries = VersionTagProps(element);
            if (versionTagEntries.length) {
                const generalGroup = groups.find((g) => g.id === 'general');
                if (generalGroup) {
                    generalGroup.entries = [...generalGroup.entries, ...versionTagEntries];
                }
                else {
                    groups.push({
                        id: 'general',
                        label: translate('General'),
                        entries: versionTagEntries,
                        component: Group,
                    });
                }
            }
            // ── Zen Form ─────────────────────────────────────────────────────────
            if (element.type === 'bpmn:UserTask') {
                groups.push({
                    id: 'zenbpm-form',
                    label: translate('Zen Form'),
                    entries: ZenFormProps(element),
                    component: Group,
                });
            }
            return groups;
        };
    }
}

var index = {
    __init__: ['zenbpmPropertiesProvider'],
    zenbpmPropertiesProvider: ['type', ZenBpmPropertiesProvider]
};

export { index as ZenBpmPropertiesProviderModule };
//# sourceMappingURL=index.mjs.map
