import { isTextFieldEntryEdited, TextFieldEntry, isFeelEntryEdited, FeelEntry, isSelectEntryEdited, SelectEntry, isToggleSwitchEntryEdited, ToggleSwitchEntry, ListGroup, isTextAreaEntryEdited, TextAreaEntry, Group } from '@bpmn-io/properties-panel';
import { createElement } from '@bpmn-io/properties-panel/preact';
import { useService } from 'bpmn-js-properties-panel';

/**
 * Reserved target name used by the form designer. The matching
 * `zenbpm:Input` is auto-created / auto-updated by `setupFormSaveHandler`
 * and is system-managed — the modeller should not see it in the
 * user-editable input mapping list.
 */
const ZEN_FORM = 'ZEN_FORM';
function ZenFormProps(element) {
    if (element.type !== 'bpmn:UserTask')
        return [];
    return [
        {
            id: 'zenFormDesignButton',
            component: ZenFormDesignButtonEntry,
            isEdited: () => false,
        },
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
    const input = (ioMapping.inputParameters || []).find((p) => p.target === ZEN_FORM);
    if (!input?.source)
        return '';
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
// ─── Form variable scanning ──────────────────────────────────────────────────
function extractFormKeys(components) {
    const keys = [];
    for (const comp of components || []) {
        if (comp.key)
            keys.push(comp.key);
        if (comp.components)
            keys.push(...extractFormKeys(comp.components));
        if (comp.rows) {
            for (const row of comp.rows) {
                if (Array.isArray(row))
                    keys.push(...extractFormKeys(row));
            }
        }
        if (comp.columns) {
            for (const col of comp.columns) {
                if (col.components)
                    keys.push(...extractFormKeys(col.components));
            }
        }
    }
    return keys;
}
function scanFormVariables(formJson) {
    try {
        const schema = JSON.parse(formJson);
        return extractFormKeys(schema.components || []);
    }
    catch {
        console.warn('[ZenBPM] Failed to parse form JSON for variable scanning');
        return [];
    }
}
/**
 * Additive, non-destructive sync: create an output for any form field
 * lacking a matching one; never delete existing (incl. manual) outputs.
 */
function syncOutputMappings(element, injector, variableKeys) {
    if (variableKeys.length === 0)
        return;
    const commandStack = injector.get('commandStack');
    const bpmnFactory = injector.get('bpmnFactory');
    const bo = element.businessObject;
    let extensionElements = bo.extensionElements;
    const commands = [];
    if (!extensionElements) {
        extensionElements = bpmnFactory.create('bpmn:ExtensionElements', {
            values: [],
        });
        extensionElements.$parent = bo;
        commands.push({
            cmd: 'element.updateModdleProperties',
            context: {
                element,
                moddleElement: bo,
                properties: { extensionElements },
            },
        });
    }
    let ioMapping = (extensionElements.values || []).find((e) => e.$instanceOf('zenbpm:IoMapping'));
    if (!ioMapping) {
        ioMapping = bpmnFactory.create('zenbpm:IoMapping', {
            inputParameters: [],
            outputParameters: [],
        });
        ioMapping.$parent = extensionElements;
        commands.push({
            cmd: 'element.updateModdleProperties',
            context: {
                element,
                moddleElement: extensionElements,
                properties: {
                    values: [...(extensionElements.values || []), ioMapping],
                },
            },
        });
    }
    const existingOutputs = ioMapping.outputParameters || [];
    const existingSources = new Set(existingOutputs.map((o) => o.source));
    const outputs = [...existingOutputs];
    const seenKeys = new Set();
    for (const key of variableKeys) {
        if (seenKeys.has(key))
            continue;
        seenKeys.add(key);
        const source = `=${key}`;
        if (existingSources.has(source))
            continue;
        const output = bpmnFactory.create('zenbpm:Output', { source, target: key });
        output.$parent = ioMapping;
        outputs.push(output);
    }
    // Only touch the model when we actually added outputs.
    if (outputs.length > existingOutputs.length) {
        commands.push({
            cmd: 'element.updateModdleProperties',
            context: { element, moddleElement: ioMapping, properties: { outputParameters: outputs } },
        });
    }
    else if (commands.length === 0) {
        return;
    }
    commandStack.execute('properties-panel.multi-command-executor', commands);
}
// ─── Form save handler ───────────────────────────────────────────────────────
const lastFormValueByElement = new Map();
function setupFormSaveHandler(injector) {
    const eventBus = injector.get('eventBus');
    eventBus.on('commandStack.element.updateModdleProperties.executed', (event) => {
        const { context } = event;
        if (!context)
            return;
        const { moddleElement, properties, element } = context;
        if (!element || element.type !== 'bpmn:UserTask')
            return;
        // Trigger on both form-edit (Input.source updated) and form-create
        // (new ZEN_FORM Input added via IoMapping.inputParameters). Without
        // the create case the sync only fires on the second save.
        const inputUpdated = moddleElement?.$type === 'zenbpm:Input' &&
            moddleElement.target === ZEN_FORM &&
            properties?.source !== undefined;
        const inputCreated = moddleElement?.$type === 'zenbpm:IoMapping' &&
            Array.isArray(properties?.inputParameters) &&
            properties.inputParameters.some((p) => p?.target === ZEN_FORM);
        if (!inputUpdated && !inputCreated)
            return;
        // Defer to avoid nested commandStack.execute() while stack is mid-execution
        setTimeout(() => {
            const formJson = getZenFormValue(element);
            if (!formJson)
                return;
            if (lastFormValueByElement.get(element.id) === formJson)
                return;
            lastFormValueByElement.set(element.id, formJson);
            const variableKeys = scanFormVariables(formJson);
            syncOutputMappings(element, injector, variableKeys);
        }, 0);
    });
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
/**
 * Remove all extension elements of `type` from `bo`. No-op if none exist.
 * Executes a single undoable command.
 */
function removeExtensionElement(element, bo, type, commandStack) {
    const extensionElements = bo.extensionElements;
    if (!extensionElements)
        return;
    const matching = (extensionElements.values || []).filter((e) => e.$instanceOf(type));
    if (!matching.length)
        return;
    const remainingValues = (extensionElements.values || []).filter((e) => !e.$instanceOf(type));
    if (remainingValues.length === 0) {
        // Removing the last value would leave an empty <bpmn:extensionElements>
        // container (dirty XML). Drop the container from the parent instead —
        // mirrors the handling in `removeParam` (IoMappingProps.ts).
        commandStack.execute('element.updateModdleProperties', {
            element,
            moddleElement: bo,
            properties: { extensionElements: undefined },
        });
    }
    else {
        commandStack.execute('element.updateModdleProperties', {
            element,
            moddleElement: extensionElements,
            properties: { values: remainingValues },
        });
    }
}
/**
 * Atomically swap extension elements: remove all instances of `removeType` and
 * ensure exactly one instance of `createType` exists.  Both changes land as a
 * single undoable step via `properties-panel.multi-command-executor`.
 *
 * Used when toggling mutually-exclusive extension elements (e.g. switching a
 * BusinessRuleTask between a CalledDecision and a TaskDefinition).
 */
function switchExtensionElement(element, bo, removeType, createType, bpmnFactory, commandStack) {
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
    const currentValues = extensionElements.values || [];
    const hasRemoveType = currentValues.some((e) => e.$instanceOf(removeType));
    const hasCreateType = currentValues.some((e) => e.$instanceOf(createType));
    // Already in the desired state — nothing to do
    if (!hasRemoveType && hasCreateType)
        return;
    let newValues = currentValues.filter((e) => !e.$instanceOf(removeType));
    if (!hasCreateType) {
        const created = bpmnFactory.create(createType, {});
        created.$parent = extensionElements;
        newValues = [...newValues, created];
    }
    commands.push({
        cmd: 'element.updateModdleProperties',
        context: { element, moddleElement: extensionElements, properties: { values: newValues } },
    });
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
function PriorityEntry(props) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');
    const debounce = useService('debounceInput');
    const bo = element.businessObject;
    const getValue = () => getExtensionElement(bo, 'zenbpm:PriorityDefinition')?.priority ?? '';
    const setValue = (value) => {
        const priorityDefinition = getExtensionElement(bo, 'zenbpm:PriorityDefinition');
        const isNullValue = value === null || value === '' || value === undefined;
        if (priorityDefinition && isNullValue) {
            // clear → remove the priority definition
            removeExtensionElement(element, bo, 'zenbpm:PriorityDefinition', commandStack);
        }
        else if (priorityDefinition && !isNullValue) {
            // update in place
            commandStack.execute('element.updateModdleProperties', {
                element,
                moddleElement: priorityDefinition,
                properties: { priority: value },
            });
        }
        else if (!priorityDefinition && !isNullValue) {
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
function AssignmentDefinitionProps(element) {
    if (element.type !== 'bpmn:UserTask')
        return [];
    return [
        { id: 'zenbpm-assign-assignee', component: AssigneeEntry, isEdited: isFeelEntryEdited },
        { id: 'zenbpm-assign-candidateGroups', component: CandidateGroupsEntry, isEdited: isFeelEntryEdited },
        { id: 'zenbpm-assign-candidateUsers', component: CandidateUsersEntry, isEdited: isFeelEntryEdited },
        { id: 'zenbpm-assign-dueDate', component: DueDateEntry, isEdited: isFeelEntryEdited },
        { id: 'zenbpm-assign-followUpDate', component: FollowUpDateEntry, isEdited: isFeelEntryEdited },
        { id: 'zenbpm-assign-priority', component: PriorityEntry, isEdited: isFeelEntryEdited },
    ];
}

// ─── constants ───────────────────────────────────────────────────────────────
const BINDING_OPTIONS = [
    { value: 'latest', label: 'Latest' },
    { value: 'deployment', label: 'Deployment' },
    { value: 'versionTag', label: 'Version tag' },
];
// ─── entry component factories ───────────────────────────────────────────────
// Call these once at module level in the consumer file to get a stable function
// reference. Never call inside getGroups / a Props function — a new reference
// each render causes Preact to unmount and remount the entry (lost focus, etc.).
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
// ─── conditional entry list helper ───────────────────────────────────────────
// Pass the pre-created (module-level) component instances so references are stable.
function bindingEntries(idPrefix, bindingTypeComponent, versionTagComponent, element, extensionType) {
    const currentBinding = getExtensionElement(element.businessObject, extensionType)?.bindingType ?? 'latest';
    const entries = [
        { id: `${idPrefix}-bindingType`, component: bindingTypeComponent, isEdited: isSelectEntryEdited },
    ];
    if (currentBinding === 'versionTag') {
        entries.push({ id: `${idPrefix}-versionTag`, component: versionTagComponent, isEdited: isTextFieldEntryEdited });
    }
    return entries;
}

const TYPE$3 = 'zenbpm:CalledElement';
const ID$2 = 'zenbpm-calledEl';
// Module-level component instances — stable references, never recreated on render.
const BindingTypeEntry$1 = makeBindingTypeEntry(ID$2, TYPE$3);
const BindingVersionTagEntry$1 = makeVersionTagEntry(ID$2, TYPE$3);
// ─── entry components ────────────────────────────────────────────────────────
function ProcessIdEntry(props) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');
    const debounce = useService('debounceInput');
    const bo = element.businessObject;
    const getValue = () => getExtensionElement(bo, TYPE$3)?.processId ?? '';
    const setValue = (value) => updateExtensionElementProps(element, bo, TYPE$3, { processId: value }, bpmnFactory, commandStack);
    return TextFieldEntry({ element, id: `${ID$2}-processId`, label: translate('Process ID'), getValue, setValue, debounce });
}
function PropagateAllChildVarsEntry(props) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');
    const bo = element.businessObject;
    const getValue = () => getExtensionElement(bo, TYPE$3)?.propagateAllChildVariables ?? false;
    const setValue = (value) => updateExtensionElementProps(element, bo, TYPE$3, { propagateAllChildVariables: value }, bpmnFactory, commandStack);
    return ToggleSwitchEntry({ element, id: `${ID$2}-propagateAllChildVariables`, label: translate('Propagate all child variables'), getValue, setValue });
}
function PropagateAllParentVarsEntry(props) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');
    const bo = element.businessObject;
    const getValue = () => getExtensionElement(bo, TYPE$3)?.propagateAllParentVariables ?? true;
    const setValue = (value) => updateExtensionElementProps(element, bo, TYPE$3, { propagateAllParentVariables: value }, bpmnFactory, commandStack);
    return ToggleSwitchEntry({ element, id: `${ID$2}-propagateAllParentVariables`, label: translate('Propagate all parent variables'), getValue, setValue });
}
// ─── exported entry list ─────────────────────────────────────────────────────
function CalledElementProps(element) {
    if (element.type !== 'bpmn:CallActivity')
        return [];
    return [
        { id: `${ID$2}-processId`, component: ProcessIdEntry, isEdited: isTextFieldEntryEdited },
        ...bindingEntries(ID$2, BindingTypeEntry$1, BindingVersionTagEntry$1, element, TYPE$3),
        { id: `${ID$2}-propagateAllChildVariables`, component: PropagateAllChildVarsEntry, isEdited: isToggleSwitchEntryEdited },
        { id: `${ID$2}-propagateAllParentVariables`, component: PropagateAllParentVarsEntry, isEdited: isToggleSwitchEntryEdited },
    ];
}

const TYPE$2 = 'zenbpm:CalledDecision';
const ID$1 = 'zenbpm-calledDecision';
// Module-level component instances — stable references, never recreated on render.
const BindingTypeEntry = makeBindingTypeEntry(ID$1, TYPE$2);
const BindingVersionTagEntry = makeVersionTagEntry(ID$1, TYPE$2);
// ─── entry components ────────────────────────────────────────────────────────
function DecisionIdEntry(props) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');
    const debounce = useService('debounceInput');
    const bo = element.businessObject;
    const getValue = () => getExtensionElement(bo, TYPE$2)?.decisionId ?? '';
    const setValue = (value) => updateExtensionElementProps(element, bo, TYPE$2, { decisionId: value }, bpmnFactory, commandStack);
    return TextFieldEntry({ element, id: `${ID$1}-decisionId`, label: translate('Decision ID'), getValue, setValue, debounce });
}
function ResultVariableEntry(props) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');
    const debounce = useService('debounceInput');
    const bo = element.businessObject;
    const getValue = () => getExtensionElement(bo, TYPE$2)?.resultVariable ?? '';
    const setValue = (value) => updateExtensionElementProps(element, bo, TYPE$2, { resultVariable: value }, bpmnFactory, commandStack);
    return TextFieldEntry({ element, id: `${ID$1}-resultVariable`, label: translate('Result variable'), getValue, setValue, debounce });
}
// ─── exported entry list ─────────────────────────────────────────────────────
function CalledDecisionProps(element) {
    if (element.type !== 'bpmn:BusinessRuleTask')
        return [];
    return [
        { id: `${ID$1}-decisionId`, component: DecisionIdEntry, isEdited: isTextFieldEntryEdited },
        ...bindingEntries(ID$1, BindingTypeEntry, BindingVersionTagEntry, element, TYPE$2),
        { id: `${ID$1}-resultVariable`, component: ResultVariableEntry, isEdited: isTextFieldEntryEdited },
    ];
}

// ─── constants ───────────────────────────────────────────────────────────────
const IMPLEMENTATION_OPTIONS = [
    { value: 'dmnDecision', label: 'DMN decision' },
    { value: 'jobWorker', label: 'Job worker' },
];
// ─── helpers ─────────────────────────────────────────────────────────────────
/**
 * Infer the current implementation type from extension elements:
 * - zenbpm:TaskDefinition present  → 'jobWorker'
 * - otherwise (zenbpm:CalledDecision or nothing) → 'dmnDecision'
 */
function getImplementationType(element) {
    return getExtensionElement(element.businessObject, 'zenbpm:TaskDefinition')
        ? 'jobWorker'
        : 'dmnDecision';
}
// ─── entry component ─────────────────────────────────────────────────────────
function ImplementationEntry(props) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');
    const bo = element.businessObject;
    const getValue = () => getImplementationType(element);
    const setValue = (value) => {
        if (value === 'jobWorker') {
            switchExtensionElement(element, bo, 'zenbpm:CalledDecision', 'zenbpm:TaskDefinition', bpmnFactory, commandStack);
        }
        else {
            switchExtensionElement(element, bo, 'zenbpm:TaskDefinition', 'zenbpm:CalledDecision', bpmnFactory, commandStack);
        }
    };
    const getOptions = () => IMPLEMENTATION_OPTIONS.map(({ value, label }) => ({ value, label: translate(label) }));
    return SelectEntry({
        element,
        id: 'zenbpm-implementation-type',
        label: translate('Implementation'),
        getValue,
        setValue,
        getOptions,
    });
}
// ─── exported entry list ─────────────────────────────────────────────────────
function ImplementationProps(_element) {
    return [
        { id: 'zenbpm-implementation-type', component: ImplementationEntry, isEdited: isSelectEntryEdited },
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
    // Show only on the process root (bpmn:Process); sub-processes use their own version lifecycle
    if (element.type !== 'bpmn:Process')
        return [];
    return [
        { id: 'zenbpm-versionTag-value', component: VersionTagEntry, isEdited: isTextFieldEntryEdited },
    ];
}

const TYPE$1 = 'zenbpm:LoopCharacteristics';
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
    return lc ? getExtensionElement(lc, TYPE$1) : undefined;
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
    const setValue = (value) => updateExtensionElementProps(element, lc, TYPE$1, { inputCollection: value }, bpmnFactory, commandStack);
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
    const setValue = (value) => updateExtensionElementProps(element, lc, TYPE$1, { inputElement: value }, bpmnFactory, commandStack);
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
    const setValue = (value) => updateExtensionElementProps(element, lc, TYPE$1, { outputCollection: value }, bpmnFactory, commandStack);
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
    const setValue = (value) => updateExtensionElementProps(element, lc, TYPE$1, { outputElement: value }, bpmnFactory, commandStack);
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
/**
 * Input mapping targets that are system-managed and must not appear in the
 * modeller-facing input mapping list. The underlying `zenbpm:Input` is left
 * untouched in the model — it is only hidden from the rendered UI.
 */
const HIDDEN_INPUT_TARGETS = new Set([]);
function supportsInputMapping(element) {
    return IO_ELEMENTS.has(element.type);
}
function supportsOutputMapping(element) {
    return IO_ELEMENTS.has(element.type) || OUTPUT_ONLY_ELEMENTS.has(element.type);
}
// `ParamEntry` is defined at module scope so its function reference never
// changes. See the matching comment in `ExtensionPropertiesProps.ts` — the
// previous `makeParamEntry` factory returned a new function on every render,
// which made Preact remount the input ~600ms after the user started typing
// and dropped keyboard focus.
function ParamEntry(props) {
    const { element: bpmnElement, param, prop, id, labelKey } = props;
    const commandStack = useService('commandStack');
    const translate = useService('translate');
    const debounce = useService('debounceInput');
    const getValue = () => prop === 'source' ? getFeelValue(param[prop]) : (param[prop] || '');
    const setValue = (value) => commandStack.execute('element.updateModdleProperties', {
        element: bpmnElement,
        moddleElement: param,
        properties: { [prop]: value },
    });
    const label = translate(labelKey);
    return prop === 'source'
        ? FeelEntry({ element: bpmnElement, id, label, feel: 'required', getValue, setValue, debounce })
        : TextFieldEntry({ element: bpmnElement, id, label, getValue, setValue, debounce });
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
    const remaining = (ioMapping[listProp] || []).filter((p) => p !== param);
    const otherProp = listProp === 'inputParameters' ? 'outputParameters' : 'inputParameters';
    const otherRemaining = ioMapping[otherProp] || [];
    if (remaining.length > 0 || otherRemaining.length > 0) {
        commandStack.execute('element.updateModdleProperties', {
            element,
            moddleElement: ioMapping,
            properties: { [listProp]: remaining },
        });
        return;
    }
    const extensionElements = element.businessObject.extensionElements;
    const newValues = (extensionElements.values || []).filter((e) => e !== ioMapping);
    if (newValues.length === 0) {
        commandStack.execute('element.updateModdleProperties', {
            element,
            moddleElement: element.businessObject,
            properties: { extensionElements: undefined },
        });
    }
    else {
        commandStack.execute('element.updateModdleProperties', {
            element,
            moddleElement: extensionElements,
            properties: { values: newValues },
        });
    }
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
    // Hide system-managed targets (e.g. ZEN_FORM) from the modeller-facing
    // list. The underlying `zenbpm:Input` is left in the model so form data
    // round-trips; only the rendered row is suppressed. We keep the original
    // underlying index in the item id so the `add` callback's `inputs.length`
    // computation stays consistent with the position new params get appended at.
    const items = inputs
        .map((input, index) => {
        if (HIDDEN_INPUT_TARGETS.has(input.target)) {
            return null;
        }
        const id = `${element.id}-zenbpm-input-${index}`;
        return {
            id,
            label: input.target || translate('<empty>'),
            entries: [
                {
                    id: `${id}-source`,
                    component: ParamEntry,
                    isEdited: isFeelEntryEdited,
                    // extras consumed by `ParamEntry` (spread into props by CollapsibleEntry):
                    param: input,
                    prop: 'source',
                    labelKey: 'Source expression',
                },
                {
                    id: `${id}-target`,
                    component: ParamEntry,
                    isEdited: isTextFieldEntryEdited,
                    param: input,
                    prop: 'target',
                    labelKey: 'Target variable',
                },
            ],
            autoFocusEntry: `${id}-target`,
            remove: () => removeParam(element, ioMapping, input, 'inputParameters', commandStack),
        };
    })
        .filter((item) => item !== null);
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
                {
                    id: `${id}-source`,
                    component: ParamEntry,
                    isEdited: isFeelEntryEdited,
                    param: output,
                    prop: 'source',
                    labelKey: 'Source expression',
                },
                {
                    id: `${id}-target`,
                    component: ParamEntry,
                    isEdited: isTextFieldEntryEdited,
                    param: output,
                    prop: 'target',
                    labelKey: 'Target variable',
                },
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

const TYPE = 'zenbpm:Subscription';
const ID = 'zenbpm-messageSubscriptionCorrelationKey';
// ─── helpers ─────────────────────────────────────────────────────────────────
/**
 * Return the bpmn:Message associated with the given diagram element, or
 * undefined if the element has no message (and therefore no subscription).
 *
 * ZenBPM only considers the following elements to be message subscribers:
 *   - bpmn:IntermediateCatchEvent (with bpmn:MessageEventDefinition)
 *   - bpmn:BoundaryEvent          (with bpmn:MessageEventDefinition)
 *   - bpmn:StartEvent             (only inside an event sub-process)
 * ReceiveTask / EndEvent / IntermediateThrowEvent are not subscription points.
 */
function getMessage(element) {
    const bo = element.businessObject;
    if (!bo) {
        return undefined;
    }
    const eventDefinitions = bo.eventDefinitions || [];
    for (const def of eventDefinitions) {
        if (def.$type === 'bpmn:MessageEventDefinition') {
            return def.get('messageRef');
        }
    }
    return undefined;
}
/**
 * Eligibility for the subscription correlation key field, derived from how the
 * ZenBPM engine actually consumes the value at runtime:
 *
 *   - bpmn:IntermediateCatchEvent / bpmn:BoundaryEvent   → yes
 *     Engine creates a TokenMessageSubscription that uses the key for matching.
 *
 *   - bpmn:StartEvent inside an event sub-process only   → yes
 *     Engine creates an InstanceMessageSubscription that uses the key.
 *
 *   - bpmn:StartEvent at the process root                → no
 *     Engine creates a DefinitionMessageSubscription that ignores the key.
 *
 *   - bpmn:ReceiveTask                                   → no
 *     Not supported by the ZenBPM engine (deployment error).
 *
 *   - bpmn:EndEvent / bpmn:IntermediateThrowEvent        → no
 *     Throw events are job-based, not subscription-based.
 */
function canHaveSubscriptionCorrelationKey(element) {
    const bo = element.businessObject;
    if (!bo) {
        return false;
    }
    if (bo.$type === 'bpmn:IntermediateCatchEvent' || bo.$type === 'bpmn:BoundaryEvent') {
        return !!getMessage(element);
    }
    if (bo.$type === 'bpmn:StartEvent') {
        const parentBo = element.parent?.businessObject;
        return !!parentBo && parentBo.$type === 'bpmn:SubProcess' && !!parentBo.triggeredByEvent;
    }
    return false;
}
// ─── entry component ────────────────────────────────────────────────────────
function MessageSubscriptionCorrelationKeyEntry(props) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');
    const debounce = useService('debounceInput');
    // The subscription lives on the referenced bpmn:Message, not on the
    // diagram element itself — this matches the zeebe:Subscription behaviour.
    // `message` can become undefined at render time if the user unlinks the
    // message after the entry is already mounted, so guard every access.
    const message = getMessage(element);
    const getValue = () => message
        ? getFeelValue(getExtensionElement(message, TYPE)?.correlationKey)
        : '';
    const setValue = (value) => {
        if (!message) {
            return;
        }
        updateExtensionElementProps(element, message, TYPE, { correlationKey: value }, bpmnFactory, commandStack);
    };
    return FeelEntry({
        element,
        id: ID,
        label: translate('Subscription correlation key'),
        feel: 'required',
        getValue,
        setValue,
        debounce,
    });
}
// ─── exported entry list ─────────────────────────────────────────────────────
function CorrelationKeyProps(element) {
    if (!canHaveSubscriptionCorrelationKey(element))
        return [];
    if (!getMessage(element))
        return [];
    return [
        { id: ID, component: MessageSubscriptionCorrelationKeyEntry, isEdited: isFeelEntryEdited },
    ];
}

/**
 * Property-name convention for Camunda/ZenBPM Modeler UI metadata.
 *
 * Camunda Modeler stores UI-only metadata on BPMN elements via
 * `zeebe:Property` extension elements whose `name` carries a `camundaModeler:`
 * prefix (e.g. `name="camundaModeler:exampleOutputJson"`). The value of such
 * a property is conventionally a JSON blob. We normalise the prefix to
 * `zenbpmModeler:` on import (see `NormalizeNamespace.normalizeZeebeXml`) and
 * use this matcher to decide which extension properties should be edited
 * with JSON validation in the properties panel.
 *
 * The match is intentionally permissive on the vendor prefix so that other
 * `*Modeler:`-flavoured names (e.g. future `bpmnIoModeler:`) can opt in
 * without changing this code.
 */
const MODELER_PROPERTY_NAME_PATTERN = /^[a-zA-Z]+Modeler:/;
/**
 * Returns `true` if `name` follows the `<vendor>Modeler:` convention for
 * Modeler-side metadata, e.g. `camundaModeler:foo`, `zenbpmModeler:foo`.
 */
function isModelerPropertyName(name) {
    if (!name)
        return false;
    return MODELER_PROPERTY_NAME_PATTERN.test(name);
}
/**
 * Validate a string as JSON. Suitable for use as a `validate` prop on a
 * bpmn-io `TextFieldEntry` / `TextAreaEntry` — returns `null` when the value
 * is acceptable (empty *or* parseable JSON) and a human-readable error
 * string otherwise.
 */
function validateJson(value) {
    if (value == null || value.trim() === '') {
        return null;
    }
    try {
        JSON.parse(value);
        return null;
    }
    catch (err) {
        return `Value must be valid JSON (${err && err.message ? err.message : 'parse error'})`;
    }
}

const TYPE_PROPERTIES$1 = 'zenbpm:Properties';
const TYPE_PROPERTY$1 = 'zenbpm:Property';
const MODELER_PREFIX = 'zenbpmModeler:';
/**
 * Known example-data properties lifted out of the generic
 * "Extension properties" list and exposed as dedicated, JSON-validated
 * entries in the "Example data" group.
 *
 * Each entry is always rendered (even if the moddle property is absent) so
 * the modeller can both inspect existing data and add new data by typing
 * a value. Clearing the field removes the moddle property.
 */
const EXAMPLE_DATA_PROPERTIES = [
    { propertyName: 'exampleOutputJson', label: 'Example output' },
];
/**
 * Returns `true` if `name` (a moddle `zenbpm:Property.name` value) is a
 * known example-data property. Used by `ExtensionPropertiesGroup` to hide
 * these properties from the generic Extension properties list.
 */
function isExampleDataPropertyName(name) {
    if (!name)
        return false;
    const colonIdx = name.indexOf(':');
    if (colonIdx < 0)
        return false;
    const localName = name.slice(colonIdx + 1);
    return EXAMPLE_DATA_PROPERTIES.some((p) => p.propertyName === localName);
}
// ─── moddle accessors / mutators ────────────────────────────────────────────
function findModelerProperty(element, propertyName) {
    const fullName = MODELER_PREFIX + propertyName;
    const container = getExtensionElement(element.businessObject, TYPE_PROPERTIES$1);
    if (!container)
        return null;
    return (container.get('properties') || []).find((p) => p.get('name') === fullName) || null;
}
function upsertModelerProperty(element, bpmnFactory, commandStack, propertyName, value) {
    const bo = element.businessObject;
    const commands = [];
    // (1) ensure bpmn:ExtensionElements exists
    let extensionElements = bo.extensionElements;
    if (!extensionElements) {
        extensionElements = bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
        extensionElements.$parent = bo;
        commands.push({
            cmd: 'element.updateModdleProperties',
            context: { element, moddleElement: bo, properties: { extensionElements } },
        });
    }
    // (2) ensure zenbpm:Properties container exists
    let container = (extensionElements.values || []).find((e) => e.$instanceOf(TYPE_PROPERTIES$1));
    if (!container) {
        container = bpmnFactory.create(TYPE_PROPERTIES$1, { properties: [] });
        container.$parent = extensionElements;
        commands.push({
            cmd: 'element.updateModdleProperties',
            context: {
                element,
                moddleElement: extensionElements,
                properties: { values: [...(extensionElements.values || []), container] },
            },
        });
    }
    // (3) update existing or create new
    const fullName = MODELER_PREFIX + propertyName;
    const existing = (container.get('properties') || []).find((p) => p.get('name') === fullName);
    if (existing) {
        commands.push({
            cmd: 'element.updateModdleProperties',
            context: { element, moddleElement: existing, properties: { value } },
        });
    }
    else {
        const created = bpmnFactory.create(TYPE_PROPERTY$1, { name: fullName, value });
        created.$parent = container;
        commands.push({
            cmd: 'element.updateModdleProperties',
            context: {
                element,
                moddleElement: container,
                properties: { properties: [...(container.get('properties') || []), created] },
            },
        });
    }
    commandStack.execute('properties-panel.multi-command-executor', commands);
}
function clearModelerProperty(element, commandStack, propertyName) {
    const bo = element.businessObject;
    const extensionElements = bo.extensionElements;
    if (!extensionElements)
        return;
    const container = (extensionElements.values || []).find((e) => e.$instanceOf(TYPE_PROPERTIES$1));
    if (!container)
        return;
    const fullName = MODELER_PREFIX + propertyName;
    const existing = (container.get('properties') || []).find((p) => p.get('name') === fullName);
    if (!existing)
        return;
    const remaining = (container.get('properties') || []).filter((p) => p !== existing);
    if (remaining.length) {
        commandStack.execute('element.updateModdleProperties', {
            element,
            moddleElement: container,
            properties: { properties: remaining },
        });
        return;
    }
    // last one — drop the whole `zenbpm:Properties` container.
    // `removeExtensionElement` also clears a now-empty <bpmn:ExtensionElements>
    // container, which the previous inline filter would leave behind as dirty XML.
    removeExtensionElement(element, bo, TYPE_PROPERTIES$1, commandStack);
}
// ─── per-row component (stable identity across re-renders) ─────────────────
function ExampleDataEntry(props) {
    const { element, propertyName, id } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');
    const debounce = useService('debounceInput');
    const moddleProperty = findModelerProperty(element, propertyName);
    const currentLabel = (EXAMPLE_DATA_PROPERTIES.find((p) => p.propertyName === propertyName) || {}).label || propertyName;
    const getValue = () => (moddleProperty ? (moddleProperty.get('value') || '') : '');
    const setValue = (value) => {
        if (value && value.trim() !== '') {
            upsertModelerProperty(element, bpmnFactory, commandStack, propertyName, value);
        }
        else if (moddleProperty) {
            clearModelerProperty(element, commandStack, propertyName);
        }
    };
    return TextAreaEntry({
        element,
        id,
        label: translate(currentLabel),
        getValue,
        setValue,
        debounce,
        isEdited: isTextAreaEntryEdited,
        validate: validateJson,
    });
}
// ─── entry descriptor factory (consumed by the provider's Group) ───────────
function ExampleDataProps(element) {
    if (!element || !element.businessObject)
        return [];
    return EXAMPLE_DATA_PROPERTIES.map(({ propertyName }) => ({
        id: `zenbpm-exampleData-${propertyName}`,
        component: ExampleDataEntry,
        isEdited: isTextAreaEntryEdited,
        // extras consumed by `ExampleDataEntry` (spread into props by CollapsibleEntry):
        element,
        propertyName,
    }));
}

const TYPE_PROPERTIES = 'zenbpm:Properties';
const TYPE_PROPERTY = 'zenbpm:Property';
// ─── accessors ───────────────────────────────────────────────────────────────
function getProperties(element) {
    return getExtensionElement(element.businessObject, TYPE_PROPERTIES);
}
function getPropertiesList(element) {
    const properties = getProperties(element);
    return properties ? (properties.get('properties') || []) : [];
}
// ─── per-row component (stable identity across re-renders) ──────────────────
//
// `PropertyEntry` is defined at module scope so its function reference never
// changes. The bpmn-io properties-panel re-renders the whole group on every
// `elements.changed` event (fired by the debounced commit ~600ms after the
// user stops typing), and Preact's keyed reconciler unmounts/remounts a row
// whose `type` changed — which previously made the input lose focus while
// typing. An earlier version of this code used a `makePropertyEntry` factory
// that returned a brand-new function on every render, causing exactly that
// remount. Routing the moddle element and the edited field through the
// entry descriptor (which `CollapsibleEntry` spreads into the component's
// props) keeps the component identity stable and preserves focus.
function PropertyEntry(props) {
    const { element: bpmnElement, property, field, id } = props;
    const commandStack = useService('commandStack');
    const translate = useService('translate');
    const debounce = useService('debounceInput');
    const getValue = () => (property.get(field) || '');
    const setValue = (value) => commandStack.execute('element.updateModdleProperties', {
        element: bpmnElement,
        moddleElement: property,
        properties: { [field]: value },
    });
    const label = translate(field === 'name' ? 'Name' : 'Value');
    // For the value of a `*Modeler:*` property we switch to a multi-line
    // textarea and JSON-validate the input. The name field stays a single-line
    // text input — names are short identifiers, not JSON blobs.
    if (field === 'value' && isModelerPropertyName(property.get('name'))) {
        return TextAreaEntry({
            element: property,
            id,
            label,
            getValue,
            setValue,
            debounce,
            isEdited: isTextAreaEntryEdited,
            validate: validateJson,
        });
    }
    return TextFieldEntry({
        element: property,
        id,
        label,
        getValue,
        setValue,
        debounce,
        isEdited: isTextFieldEntryEdited,
    });
}
// ─── add / remove ────────────────────────────────────────────────────────────
function addProperty(element, bpmnFactory, commandStack, eventBus, currentCount) {
    const bo = element.businessObject;
    const commands = [];
    let extensionElements = bo.extensionElements;
    // (1) ensure bpmn:ExtensionElements
    if (!extensionElements) {
        extensionElements = bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
        extensionElements.$parent = bo;
        commands.push({
            cmd: 'element.updateModdleProperties',
            context: { element, moddleElement: bo, properties: { extensionElements } },
        });
    }
    // (2) ensure zenbpm:Properties container (re-use if present)
    let properties = (extensionElements.values || []).find((e) => e.$instanceOf(TYPE_PROPERTIES));
    if (!properties) {
        properties = bpmnFactory.create(TYPE_PROPERTIES, { properties: [] });
        properties.$parent = extensionElements;
        commands.push({
            cmd: 'element.updateModdleProperties',
            context: {
                element,
                moddleElement: extensionElements,
                properties: { values: [...(extensionElements.values || []), properties] },
            },
        });
    }
    // (3) create the new zenbpm:Property and append it to the container's `properties` list
    const created = bpmnFactory.create(TYPE_PROPERTY, { name: '', value: '' });
    created.$parent = properties;
    commands.push({
        cmd: 'element.updateModdleProperties',
        context: {
            element,
            moddleElement: properties,
            properties: { properties: [...(properties.get('properties') || []), created] },
        },
    });
    commandStack.execute('properties-panel.multi-command-executor', commands);
    const newId = `${element.id}-zenbpm-extensionProperty-${currentCount}`;
    setTimeout(() => eventBus.fire('propertiesPanel.showEntry', { id: `${newId}-name` }), 0);
}
function removeProperty(element, property, commandStack) {
    const properties = getProperties(element);
    if (!properties)
        return;
    const remaining = (properties.get('properties') || []).filter((p) => p !== property);
    if (remaining.length) {
        commandStack.execute('element.updateModdleProperties', {
            element,
            moddleElement: properties,
            properties: { properties: remaining },
        });
    }
    else {
        // last one removed → drop the whole `zenbpm:Properties` container too.
        // `removeExtensionElement` also removes an now-empty <bpmn:ExtensionElements>
        // container, which the previous inline filter would have left behind as dirty XML.
        removeExtensionElement(element, element.businessObject, TYPE_PROPERTIES, commandStack);
    }
}
// ─── exported group factory ──────────────────────────────────────────────────
function ExtensionPropertiesGroup(element, injector) {
    const commandStack = injector.get('commandStack');
    const bpmnFactory = injector.get('bpmnFactory');
    const translate = injector.get('translate');
    const eventBus = injector.get('eventBus');
    const list = getPropertiesList(element);
    // Example-data properties (e.g. `zenbpmModeler:exampleOutputJson`) are
    // surfaced in the dedicated "Example data" group instead, so they must
    // not appear here.
    const visibleList = list.filter((p) => !isExampleDataPropertyName(p.get('name')));
    // Hide example-data properties from this list but keep the underlying
    // (unfiltered) index in the item id, so the `add` callback's `list.length`
    // computation stays consistent with the position new properties get appended
    // at — see IoMappingProps.ts for the same pattern.
    const items = visibleList.map((property) => {
        const index = list.indexOf(property);
        const id = `${element.id}-zenbpm-extensionProperty-${index}`;
        return {
            id,
            label: property.get('name') || translate('<empty>'),
            entries: [
                {
                    id: `${id}-name`,
                    component: PropertyEntry,
                    isEdited: isTextFieldEntryEdited,
                    // extras consumed by `PropertyEntry` (spread into props by CollapsibleEntry):
                    property,
                    field: 'name',
                },
                {
                    id: `${id}-value`,
                    component: PropertyEntry,
                    isEdited: isTextFieldEntryEdited,
                    property,
                    field: 'value',
                },
            ],
            autoFocusEntry: `${id}-name`,
            remove: () => removeProperty(element, property, commandStack),
        };
    });
    return {
        id: 'zenbpm-extensionProperties',
        label: translate('Extension properties'),
        component: ListGroup,
        items,
        add: () => addProperty(element, bpmnFactory, commandStack, eventBus, list.length),
    };
}

const PROVIDER_PRIORITY = 500;
class ZenBpmPropertiesProvider {
    static $inject = ['propertiesPanel', 'injector'];
    _injector;
    constructor(propertiesPanel, injector) {
        this._injector = injector;
        propertiesPanel.registerProvider(PROVIDER_PRIORITY, this);
        // When the Zen Form editor is submitted, scan form field variables
        // and automatically add them to the output mapping.
        setupFormSaveHandler(injector);
    }
    getGroups(element) {
        return (groups) => {
            const translate = this._injector.get('translate');
            // ── Implementation (Business Rule Task only) ─────────────────────────
            if (element.type === 'bpmn:BusinessRuleTask') {
                groups.push({
                    id: 'zenbpm-implementation',
                    label: translate('Implementation'),
                    entries: ImplementationProps(),
                    component: Group,
                });
            }
            // ── Task Definition ──────────────────────────────────────────────────
            // Shown for all service-task-like types except BusinessRuleTask, where it
            // is only shown when the implementation is set to Job worker.
            const showTaskDefinition = (isServiceTaskLike(element) && element.type !== 'bpmn:BusinessRuleTask') ||
                (element.type === 'bpmn:BusinessRuleTask' && getImplementationType(element) === 'jobWorker');
            if (showTaskDefinition) {
                groups.push({
                    id: 'zenbpm-taskDefinition',
                    label: translate('Task definition'),
                    entries: TaskDefinitionProps(element),
                    component: Group,
                });
            }
            // ── Called Decision ──────────────────────────────────────────────────
            if (element.type === 'bpmn:BusinessRuleTask' && getImplementationType(element) === 'dmnDecision') {
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
            // The standard bpmn-js-properties-panel adds zeebe:LoopCharacteristics
            // entries to the 'multiInstance' group. We replace the entire group with
            // our zenbpm:LoopCharacteristics entries to avoid duplicate fields.
            const multiInstanceEntries = MultiInstanceProps(element);
            if (multiInstanceEntries.length) {
                const existingGroupIdx = groups.findIndex((g) => g.id === 'multiInstance');
                if (existingGroupIdx !== -1) {
                    groups[existingGroupIdx].entries = multiInstanceEntries;
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
            // ── Message subscription correlation key ────────────────────────────
            // Appended to the standard 'message' group (created by bpmn-js-properties-panel)
            // so it sits right under the message name, mirroring the zeebe:Subscription UX.
            const correlationKeyEntries = CorrelationKeyProps(element);
            if (correlationKeyEntries.length) {
                const messageGroup = groups.find((g) => g.id === 'message');
                if (messageGroup) {
                    messageGroup.entries = [...messageGroup.entries, ...correlationKeyEntries];
                }
                else {
                    groups.push({
                        id: 'message',
                        label: translate('Message'),
                        entries: correlationKeyEntries,
                        component: Group,
                    });
                }
            }
            // ── Condition expression ─────────────────────────────────────────────
            // The standard bpmn-js-properties-panel already adds a 'conditionExpression'
            // entry to the 'condition' group. We replace the entire group so that only
            // the FEEL-based ZenBPM entry is shown (avoids a duplicate field).
            const conditionEntries = ConditionExpressionProps(element);
            if (conditionEntries.length) {
                const conditionGroupIdx = groups.findIndex((g) => g.id === 'condition');
                if (conditionGroupIdx !== -1) {
                    // Replace the standard entries with our FEEL entry
                    groups[conditionGroupIdx].entries = conditionEntries;
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
            // ── Extension properties (zenbpm:Properties / zenbpm:Property) ──────
            // Generic key/value list available on any element. Mirrors Zeebe's
            // zeebe:Properties/zeebe:Property; in ZenBPM it is used to attach
            // arbitrary metadata (e.g. the ZEN_FORM JSON for a UserTask) and is
            // preserved on round-trip even though the engine does not read the
            // values at runtime.
            groups.push(ExtensionPropertiesGroup(element, this._injector));
            // ── Example data (dedicated UI for known *Modeler:* properties) ────
            // The Camunda/ZenBPM Modeler stores example input/output data on
            // tasks as `camundaModeler:exampleOutputJson` etc. (renamed to
            // `zenbpmModeler:*` on import). These are surfaced here as typed
            // JSON-validated fields instead of the generic key/value list.
            const exampleDataEntries = ExampleDataProps(element);
            if (exampleDataEntries.length) {
                groups.push({
                    id: 'zenbpm-exampleData',
                    label: translate('Example data'),
                    entries: exampleDataEntries,
                    component: Group,
                });
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

const ZEEBE_NAMESPACE_URI = 'xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"';
const ZENBPM_NAMESPACE_URI = 'xmlns:zenbpm="http://zenbpm.pbinitiative.org/1.0"';
/**
 * Camunda Modeler stores UI-only metadata on BPMN elements via `zeebe:Property`
 * extension elements whose `name` carries a `camundaModeler:` prefix (e.g.
 * `name="camundaModeler:exampleOutputJson"`). On import we rename that prefix
 * to our own `zenbpmModeler:` so the moddle model is self-consistent; on
 * export back to Camunda we reverse the rename.
 */
const CAMUNDA_MODELER_PREFIX = 'name="camundaModeler:';
const ZENBPM_MODELER_PREFIX = 'name="zenbpmModeler:';
/**
 * Rewrite Camunda/Zeebe-flavoured XML into the ZenBPM flavour.
 *
 *   <zeebe:property name="camundaModeler:foo" value="{}"/>
 *     →  <zenbpm:property name="zenbpmModeler:foo" value="{}"/>
 *
 * Intended to be called by the host application **before** `modeler.importXML()`.
 * It is a text-level transform, so it is best-effort: the `name` rewrite
 * matches anywhere a literal `name="camundaModeler:` appears. That prefix is
 * specific enough not to collide with any other attribute in valid BPMN/ZenBPM
 * XML.
 */
function normalizeZeebeXml(xml) {
    return xml
        .replace(new RegExp(ZEEBE_NAMESPACE_URI, 'g'), ZENBPM_NAMESPACE_URI)
        .replace(new RegExp("<zeebe:", 'g'), "<zenbpm:")
        .replace(new RegExp("</zeebe:", 'g'), "</zenbpm:")
        .replace(new RegExp(CAMUNDA_MODELER_PREFIX, 'g'), ZENBPM_MODELER_PREFIX);
}
/**
 * Inverse of {@link normalizeZeebeXml}. Rewrites ZenBPM-flavoured XML into a
 * Camunda/Zeebe-flavoured XML that Camunda Modeler / Zeebe tooling can read.
 *
 *   <zenbpm:property name="zenbpmModeler:foo" value="{}"/>
 *     →  <zeebe:property name="camundaModeler:foo" value="{}"/>
 *
 * Intended to be called by the host application **after** `modeler.saveXML()`
 * to produce a Camunda-compatible export.
 */
function denormalizeToZeebeXml(xml) {
    return xml
        .replace(new RegExp(ZENBPM_NAMESPACE_URI, 'g'), ZEEBE_NAMESPACE_URI)
        .replace(new RegExp("<zenbpm:", 'g'), "<zeebe:")
        .replace(new RegExp("</zenbpm:", 'g'), "</zeebe:")
        .replace(new RegExp(ZENBPM_MODELER_PREFIX, 'g'), CAMUNDA_MODELER_PREFIX);
}

export { index as ZenBpmPropertiesProviderModule, denormalizeToZeebeXml, normalizeZeebeXml };
//# sourceMappingURL=index.mjs.map
