'use strict';

var propertiesPanel = require('@bpmn-io/properties-panel');
var preact = require('@bpmn-io/properties-panel/preact');
var bpmnJsPropertiesPanel = require('bpmn-js-properties-panel');

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
    const input = (ioMapping.inputParameters || []).find((p) => p.target === 'ZEN_FORM');
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
    const translate = bpmnJsPropertiesPanel.useService('translate');
    const handleClick = () => {
        const currentValue = getZenFormValue(element);
        document.dispatchEvent(new CustomEvent('bpmn-open-form-designer', {
            detail: { elementId: element.id, value: currentValue },
        }));
    };
    return preact.createElement('div', { class: 'bio-properties-panel-entry', style: 'padding: 0 10px 6px' }, preact.createElement('button', {
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
 * Sync output mappings with current form fields.
 * - Form fields without an existing output get a default one.
 * - Existing outputs with the same source are kept, preserving user's target.
 * - Outputs for removed form fields are dropped.
 */
function syncOutputMappings(element, injector, variableKeys) {
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
    // Index existing outputs by source
    const existingBySource = new Map((ioMapping.outputParameters || []).map((o) => [o.source, o]));
    // For each form field, produce an output — reusing existing one if available
    const outputs = variableKeys.map((key) => {
        const source = `=${key}`;
        const existing = existingBySource.get(source);
        if (existing)
            return existing;
        const output = bpmnFactory.create('zenbpm:Output', {
            source,
            target: key,
        });
        output.$parent = ioMapping;
        return output;
    });
    commands.push({
        cmd: 'element.updateModdleProperties',
        context: {
            element,
            moddleElement: ioMapping,
            properties: { outputParameters: outputs },
        },
    });
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
        if (moddleElement?.$type !== 'zenbpm:Input' ||
            moddleElement.target !== 'ZEN_FORM' ||
            properties?.source === undefined) {
            return;
        }
        if (!element || element.type !== 'bpmn:UserTask')
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
    const commandStack = bpmnJsPropertiesPanel.useService('commandStack');
    const bpmnFactory = bpmnJsPropertiesPanel.useService('bpmnFactory');
    const translate = bpmnJsPropertiesPanel.useService('translate');
    const debounce = bpmnJsPropertiesPanel.useService('debounceInput');
    const bo = element.businessObject;
    const getValue = () => getExtensionElement(bo, 'zenbpm:TaskDefinition')?.type ?? '';
    const setValue = (value) => updateExtensionElementProps(element, bo, 'zenbpm:TaskDefinition', { type: value }, bpmnFactory, commandStack);
    return propertiesPanel.TextFieldEntry({ element, id: 'zenbpm-taskDef-type', label: translate('Type'), getValue, setValue, debounce });
}
function RetriesEntry(props) {
    const { element } = props;
    const commandStack = bpmnJsPropertiesPanel.useService('commandStack');
    const bpmnFactory = bpmnJsPropertiesPanel.useService('bpmnFactory');
    const translate = bpmnJsPropertiesPanel.useService('translate');
    const debounce = bpmnJsPropertiesPanel.useService('debounceInput');
    const bo = element.businessObject;
    const getValue = () => getExtensionElement(bo, 'zenbpm:TaskDefinition')?.retries ?? '';
    const setValue = (value) => updateExtensionElementProps(element, bo, 'zenbpm:TaskDefinition', { retries: value }, bpmnFactory, commandStack);
    return propertiesPanel.TextFieldEntry({ element, id: 'zenbpm-taskDef-retries', label: translate('Retries'), getValue, setValue, debounce });
}
// ─── exported entry list ─────────────────────────────────────────────────────
function TaskDefinitionProps(element) {
    if (!isServiceTaskLike(element))
        return [];
    return [
        { id: 'zenbpm-taskDef-type', component: TypeEntry, isEdited: propertiesPanel.isTextFieldEntryEdited },
        { id: 'zenbpm-taskDef-retries', component: RetriesEntry, isEdited: propertiesPanel.isTextFieldEntryEdited },
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
        const commandStack = bpmnJsPropertiesPanel.useService('commandStack');
        const bpmnFactory = bpmnJsPropertiesPanel.useService('bpmnFactory');
        const translate = bpmnJsPropertiesPanel.useService('translate');
        const debounce = bpmnJsPropertiesPanel.useService('debounceInput');
        const bo = element.businessObject;
        const getValue = () => getFeelValue(getExtensionElement(bo, extensionType)?.[prop]);
        const setValue = (value) => updateExtensionElementProps(element, bo, extensionType, { [prop]: value }, bpmnFactory, commandStack);
        return propertiesPanel.FeelEntry({ element, id, label: translate(labelKey), feel: 'required', getValue, setValue, debounce });
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
        { id: 'zenbpm-assign-assignee', component: AssigneeEntry, isEdited: propertiesPanel.isFeelEntryEdited },
        { id: 'zenbpm-assign-candidateGroups', component: CandidateGroupsEntry, isEdited: propertiesPanel.isFeelEntryEdited },
        { id: 'zenbpm-assign-candidateUsers', component: CandidateUsersEntry, isEdited: propertiesPanel.isFeelEntryEdited },
        { id: 'zenbpm-assign-dueDate', component: DueDateEntry, isEdited: propertiesPanel.isFeelEntryEdited },
        { id: 'zenbpm-assign-followUpDate', component: FollowUpDateEntry, isEdited: propertiesPanel.isFeelEntryEdited },
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
        const commandStack = bpmnJsPropertiesPanel.useService('commandStack');
        const bpmnFactory = bpmnJsPropertiesPanel.useService('bpmnFactory');
        const translate = bpmnJsPropertiesPanel.useService('translate');
        const bo = element.businessObject;
        const getValue = () => getExtensionElement(bo, extensionType)?.bindingType ?? 'latest';
        const setValue = (value) => updateExtensionElementProps(element, bo, extensionType, { bindingType: value }, bpmnFactory, commandStack);
        const getOptions = () => BINDING_OPTIONS.map(({ value, label }) => ({ value, label: translate(label) }));
        return propertiesPanel.SelectEntry({ element, id: `${idPrefix}-bindingType`, label: translate('Binding'), getValue, setValue, getOptions });
    };
}
function makeVersionTagEntry(idPrefix, extensionType) {
    return function VersionTagEntry(props) {
        const { element } = props;
        const commandStack = bpmnJsPropertiesPanel.useService('commandStack');
        const bpmnFactory = bpmnJsPropertiesPanel.useService('bpmnFactory');
        const translate = bpmnJsPropertiesPanel.useService('translate');
        const debounce = bpmnJsPropertiesPanel.useService('debounceInput');
        const bo = element.businessObject;
        const getValue = () => getExtensionElement(bo, extensionType)?.versionTag ?? '';
        const setValue = (value) => updateExtensionElementProps(element, bo, extensionType, { versionTag: value }, bpmnFactory, commandStack);
        return propertiesPanel.TextFieldEntry({ element, id: `${idPrefix}-versionTag`, label: translate('Version tag'), getValue, setValue, debounce });
    };
}
// ─── conditional entry list helper ───────────────────────────────────────────
// Pass the pre-created (module-level) component instances so references are stable.
function bindingEntries(idPrefix, bindingTypeComponent, versionTagComponent, element, extensionType) {
    const currentBinding = getExtensionElement(element.businessObject, extensionType)?.bindingType ?? 'latest';
    const entries = [
        { id: `${idPrefix}-bindingType`, component: bindingTypeComponent, isEdited: propertiesPanel.isSelectEntryEdited },
    ];
    if (currentBinding === 'versionTag') {
        entries.push({ id: `${idPrefix}-versionTag`, component: versionTagComponent, isEdited: propertiesPanel.isTextFieldEntryEdited });
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
    const commandStack = bpmnJsPropertiesPanel.useService('commandStack');
    const bpmnFactory = bpmnJsPropertiesPanel.useService('bpmnFactory');
    const translate = bpmnJsPropertiesPanel.useService('translate');
    const debounce = bpmnJsPropertiesPanel.useService('debounceInput');
    const bo = element.businessObject;
    const getValue = () => getExtensionElement(bo, TYPE$3)?.processId ?? '';
    const setValue = (value) => updateExtensionElementProps(element, bo, TYPE$3, { processId: value }, bpmnFactory, commandStack);
    return propertiesPanel.TextFieldEntry({ element, id: `${ID$2}-processId`, label: translate('Process ID'), getValue, setValue, debounce });
}
function PropagateAllChildVarsEntry(props) {
    const { element } = props;
    const commandStack = bpmnJsPropertiesPanel.useService('commandStack');
    const bpmnFactory = bpmnJsPropertiesPanel.useService('bpmnFactory');
    const translate = bpmnJsPropertiesPanel.useService('translate');
    const bo = element.businessObject;
    const getValue = () => getExtensionElement(bo, TYPE$3)?.propagateAllChildVariables ?? false;
    const setValue = (value) => updateExtensionElementProps(element, bo, TYPE$3, { propagateAllChildVariables: value }, bpmnFactory, commandStack);
    return propertiesPanel.ToggleSwitchEntry({ element, id: `${ID$2}-propagateAllChildVariables`, label: translate('Propagate all child variables'), getValue, setValue });
}
function PropagateAllParentVarsEntry(props) {
    const { element } = props;
    const commandStack = bpmnJsPropertiesPanel.useService('commandStack');
    const bpmnFactory = bpmnJsPropertiesPanel.useService('bpmnFactory');
    const translate = bpmnJsPropertiesPanel.useService('translate');
    const bo = element.businessObject;
    const getValue = () => getExtensionElement(bo, TYPE$3)?.propagateAllParentVariables ?? true;
    const setValue = (value) => updateExtensionElementProps(element, bo, TYPE$3, { propagateAllParentVariables: value }, bpmnFactory, commandStack);
    return propertiesPanel.ToggleSwitchEntry({ element, id: `${ID$2}-propagateAllParentVariables`, label: translate('Propagate all parent variables'), getValue, setValue });
}
// ─── exported entry list ─────────────────────────────────────────────────────
function CalledElementProps(element) {
    if (element.type !== 'bpmn:CallActivity')
        return [];
    return [
        { id: `${ID$2}-processId`, component: ProcessIdEntry, isEdited: propertiesPanel.isTextFieldEntryEdited },
        ...bindingEntries(ID$2, BindingTypeEntry$1, BindingVersionTagEntry$1, element, TYPE$3),
        { id: `${ID$2}-propagateAllChildVariables`, component: PropagateAllChildVarsEntry, isEdited: propertiesPanel.isToggleSwitchEntryEdited },
        { id: `${ID$2}-propagateAllParentVariables`, component: PropagateAllParentVarsEntry, isEdited: propertiesPanel.isToggleSwitchEntryEdited },
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
    const commandStack = bpmnJsPropertiesPanel.useService('commandStack');
    const bpmnFactory = bpmnJsPropertiesPanel.useService('bpmnFactory');
    const translate = bpmnJsPropertiesPanel.useService('translate');
    const debounce = bpmnJsPropertiesPanel.useService('debounceInput');
    const bo = element.businessObject;
    const getValue = () => getExtensionElement(bo, TYPE$2)?.decisionId ?? '';
    const setValue = (value) => updateExtensionElementProps(element, bo, TYPE$2, { decisionId: value }, bpmnFactory, commandStack);
    return propertiesPanel.TextFieldEntry({ element, id: `${ID$1}-decisionId`, label: translate('Decision ID'), getValue, setValue, debounce });
}
function ResultVariableEntry(props) {
    const { element } = props;
    const commandStack = bpmnJsPropertiesPanel.useService('commandStack');
    const bpmnFactory = bpmnJsPropertiesPanel.useService('bpmnFactory');
    const translate = bpmnJsPropertiesPanel.useService('translate');
    const debounce = bpmnJsPropertiesPanel.useService('debounceInput');
    const bo = element.businessObject;
    const getValue = () => getExtensionElement(bo, TYPE$2)?.resultVariable ?? '';
    const setValue = (value) => updateExtensionElementProps(element, bo, TYPE$2, { resultVariable: value }, bpmnFactory, commandStack);
    return propertiesPanel.TextFieldEntry({ element, id: `${ID$1}-resultVariable`, label: translate('Result variable'), getValue, setValue, debounce });
}
// ─── exported entry list ─────────────────────────────────────────────────────
function CalledDecisionProps(element) {
    if (element.type !== 'bpmn:BusinessRuleTask')
        return [];
    return [
        { id: `${ID$1}-decisionId`, component: DecisionIdEntry, isEdited: propertiesPanel.isTextFieldEntryEdited },
        ...bindingEntries(ID$1, BindingTypeEntry, BindingVersionTagEntry, element, TYPE$2),
        { id: `${ID$1}-resultVariable`, component: ResultVariableEntry, isEdited: propertiesPanel.isTextFieldEntryEdited },
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
    const commandStack = bpmnJsPropertiesPanel.useService('commandStack');
    const bpmnFactory = bpmnJsPropertiesPanel.useService('bpmnFactory');
    const translate = bpmnJsPropertiesPanel.useService('translate');
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
    return propertiesPanel.SelectEntry({
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
        { id: 'zenbpm-implementation-type', component: ImplementationEntry, isEdited: propertiesPanel.isSelectEntryEdited },
    ];
}

// ─── entry component ─────────────────────────────────────────────────────────
function VersionTagEntry(props) {
    const { element } = props;
    const commandStack = bpmnJsPropertiesPanel.useService('commandStack');
    const bpmnFactory = bpmnJsPropertiesPanel.useService('bpmnFactory');
    const translate = bpmnJsPropertiesPanel.useService('translate');
    const debounce = bpmnJsPropertiesPanel.useService('debounceInput');
    // Version tag sits on the process business object.
    // For the canvas root the bo IS the process; for a sub-process it is too.
    const bo = element.businessObject;
    const getValue = () => getExtensionElement(bo, 'zenbpm:VersionTag')?.value ?? '';
    const setValue = (value) => updateExtensionElementProps(element, bo, 'zenbpm:VersionTag', { value }, bpmnFactory, commandStack);
    return propertiesPanel.TextFieldEntry({
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
        { id: 'zenbpm-versionTag-value', component: VersionTagEntry, isEdited: propertiesPanel.isTextFieldEntryEdited },
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
    const commandStack = bpmnJsPropertiesPanel.useService('commandStack');
    const bpmnFactory = bpmnJsPropertiesPanel.useService('bpmnFactory');
    const translate = bpmnJsPropertiesPanel.useService('translate');
    const debounce = bpmnJsPropertiesPanel.useService('debounceInput');
    const lc = getMultiInstanceLoopCharacteristics(element);
    const getValue = () => getZenbpmLoopCharacteristics(element)?.inputCollection ?? '';
    const setValue = (value) => updateExtensionElementProps(element, lc, TYPE$1, { inputCollection: value }, bpmnFactory, commandStack);
    return propertiesPanel.FeelEntry({
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
    const commandStack = bpmnJsPropertiesPanel.useService('commandStack');
    const bpmnFactory = bpmnJsPropertiesPanel.useService('bpmnFactory');
    const translate = bpmnJsPropertiesPanel.useService('translate');
    const debounce = bpmnJsPropertiesPanel.useService('debounceInput');
    const lc = getMultiInstanceLoopCharacteristics(element);
    const getValue = () => getZenbpmLoopCharacteristics(element)?.inputElement ?? '';
    const setValue = (value) => updateExtensionElementProps(element, lc, TYPE$1, { inputElement: value }, bpmnFactory, commandStack);
    return propertiesPanel.TextFieldEntry({
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
    const commandStack = bpmnJsPropertiesPanel.useService('commandStack');
    const bpmnFactory = bpmnJsPropertiesPanel.useService('bpmnFactory');
    const translate = bpmnJsPropertiesPanel.useService('translate');
    const debounce = bpmnJsPropertiesPanel.useService('debounceInput');
    const lc = getMultiInstanceLoopCharacteristics(element);
    const getValue = () => getZenbpmLoopCharacteristics(element)?.outputCollection ?? '';
    const setValue = (value) => updateExtensionElementProps(element, lc, TYPE$1, { outputCollection: value }, bpmnFactory, commandStack);
    return propertiesPanel.TextFieldEntry({
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
    const commandStack = bpmnJsPropertiesPanel.useService('commandStack');
    const bpmnFactory = bpmnJsPropertiesPanel.useService('bpmnFactory');
    const translate = bpmnJsPropertiesPanel.useService('translate');
    const debounce = bpmnJsPropertiesPanel.useService('debounceInput');
    const lc = getMultiInstanceLoopCharacteristics(element);
    const getValue = () => getZenbpmLoopCharacteristics(element)?.outputElement ?? '';
    const setValue = (value) => updateExtensionElementProps(element, lc, TYPE$1, { outputElement: value }, bpmnFactory, commandStack);
    return propertiesPanel.FeelEntry({
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
    const commandStack = bpmnJsPropertiesPanel.useService('commandStack');
    const bpmnFactory = bpmnJsPropertiesPanel.useService('bpmnFactory');
    const translate = bpmnJsPropertiesPanel.useService('translate');
    const debounce = bpmnJsPropertiesPanel.useService('debounceInput');
    const lc = getMultiInstanceLoopCharacteristics(element);
    const getValue = () => getFormalExpressionValue(lc.completionCondition);
    const setValue = (value) => setFormalExpression(element, lc, 'completionCondition', value, bpmnFactory, commandStack);
    return propertiesPanel.FeelEntry({
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
        { id: 'zenbpm-multiInstance-inputCollection', component: InputCollectionEntry, isEdited: propertiesPanel.isFeelEntryEdited },
        { id: 'zenbpm-multiInstance-inputElement', component: InputElementEntry, isEdited: propertiesPanel.isTextFieldEntryEdited },
        { id: 'zenbpm-multiInstance-outputCollection', component: OutputCollectionEntry, isEdited: propertiesPanel.isTextFieldEntryEdited },
        { id: 'zenbpm-multiInstance-outputElement', component: OutputElementEntry, isEdited: propertiesPanel.isFeelEntryEdited },
        { id: 'zenbpm-multiInstance-completionCondition', component: CompletionConditionEntry, isEdited: propertiesPanel.isFeelEntryEdited },
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
        const commandStack = bpmnJsPropertiesPanel.useService('commandStack');
        const translate = bpmnJsPropertiesPanel.useService('translate');
        const debounce = bpmnJsPropertiesPanel.useService('debounceInput');
        const getValue = () => prop === 'source' ? getFeelValue(param[prop]) : (param[prop] || '');
        const setValue = (value) => commandStack.execute('element.updateModdleProperties', {
            element,
            moddleElement: param,
            properties: { [prop]: value },
        });
        return prop === 'source'
            ? propertiesPanel.FeelEntry({ element, id, label: translate(labelKey), feel: 'required', getValue, setValue, debounce })
            : propertiesPanel.TextFieldEntry({ element, id, label: translate(labelKey), getValue, setValue, debounce });
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
                { id: `${id}-source`, component: makeParamEntry(`${id}-source`, 'Source expression', 'source', element, input), isEdited: propertiesPanel.isFeelEntryEdited },
                { id: `${id}-target`, component: makeParamEntry(`${id}-target`, 'Target variable', 'target', element, input), isEdited: propertiesPanel.isTextFieldEntryEdited },
            ],
            autoFocusEntry: `${id}-target`,
            remove: () => removeParam(element, ioMapping, input, 'inputParameters', commandStack),
        };
    });
    return {
        id: 'zenbpm-ioMapping-inputs',
        label: translate('Input mapping'),
        component: propertiesPanel.ListGroup,
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
                { id: `${id}-source`, component: makeParamEntry(`${id}-source`, 'Source expression', 'source', element, output), isEdited: propertiesPanel.isFeelEntryEdited },
                { id: `${id}-target`, component: makeParamEntry(`${id}-target`, 'Target variable', 'target', element, output), isEdited: propertiesPanel.isTextFieldEntryEdited },
            ],
            autoFocusEntry: `${id}-target`,
            remove: () => removeParam(element, ioMapping, output, 'outputParameters', commandStack),
        };
    });
    return {
        id: 'zenbpm-ioMapping-outputs',
        label: translate('Output mapping'),
        component: propertiesPanel.ListGroup,
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
    const commandStack = bpmnJsPropertiesPanel.useService('commandStack');
    const bpmnFactory = bpmnJsPropertiesPanel.useService('bpmnFactory');
    const translate = bpmnJsPropertiesPanel.useService('translate');
    const debounce = bpmnJsPropertiesPanel.useService('debounceInput');
    const bo = element.businessObject;
    const getValue = () => getFormalExpressionValue(bo.conditionExpression);
    const setValue = (value) => setFormalExpression(element, bo, 'conditionExpression', value, bpmnFactory, commandStack);
    return propertiesPanel.FeelEntry({
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
        { id: 'zenbpm-conditionExpression', component: ConditionExpressionEntry, isEdited: propertiesPanel.isFeelEntryEdited },
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
    const commandStack = bpmnJsPropertiesPanel.useService('commandStack');
    const bpmnFactory = bpmnJsPropertiesPanel.useService('bpmnFactory');
    const translate = bpmnJsPropertiesPanel.useService('translate');
    const debounce = bpmnJsPropertiesPanel.useService('debounceInput');
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
    return propertiesPanel.FeelEntry({
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
        { id: ID, component: MessageSubscriptionCorrelationKeyEntry, isEdited: propertiesPanel.isFeelEntryEdited },
    ];
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
                    component: propertiesPanel.Group,
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
                    component: propertiesPanel.Group,
                });
            }
            // ── Called Decision ──────────────────────────────────────────────────
            if (element.type === 'bpmn:BusinessRuleTask' && getImplementationType(element) === 'dmnDecision') {
                groups.push({
                    id: 'zenbpm-calledDecision',
                    label: translate('Called decision'),
                    entries: CalledDecisionProps(element),
                    component: propertiesPanel.Group,
                });
            }
            // ── Called Element ───────────────────────────────────────────────────
            if (element.type === 'bpmn:CallActivity') {
                groups.push({
                    id: 'zenbpm-calledElement',
                    label: translate('Called element'),
                    entries: CalledElementProps(element),
                    component: propertiesPanel.Group,
                });
            }
            // ── Assignment Definition ────────────────────────────────────────────
            if (element.type === 'bpmn:UserTask') {
                groups.push({
                    id: 'zenbpm-assignmentDefinition',
                    label: translate('Assignment'),
                    entries: AssignmentDefinitionProps(element),
                    component: propertiesPanel.Group,
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
                        component: propertiesPanel.Group,
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
                        component: propertiesPanel.Group,
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
                        component: propertiesPanel.Group,
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
                        component: propertiesPanel.Group,
                    });
                }
            }
            // ── Zen Form ─────────────────────────────────────────────────────────
            if (element.type === 'bpmn:UserTask') {
                groups.push({
                    id: 'zenbpm-form',
                    label: translate('Zen Form'),
                    entries: ZenFormProps(element),
                    component: propertiesPanel.Group,
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
function normalizeZeebeXml(xml) {
    return xml
        .replace(new RegExp(ZEEBE_NAMESPACE_URI, 'g'), ZENBPM_NAMESPACE_URI)
        .replace(new RegExp("<zeebe:", 'g'), "<zenbpm:")
        .replace(new RegExp("</zeebe:", 'g'), "</zenbpm:");
}

exports.ZenBpmPropertiesProviderModule = index;
exports.normalizeZeebeXml = normalizeZeebeXml;
//# sourceMappingURL=index.cjs.map
