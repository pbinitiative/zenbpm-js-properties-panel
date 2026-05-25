import { isTextFieldEntryEdited, TextFieldEntry, isToggleSwitchEntryEdited, ToggleSwitchEntry, isFeelEntryEdited, FeelEntry, ListGroup, Group } from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';

var n,l,u,s=[];function y(l,u,t){var i,o,r,f={};for(r in u)"key"==r?i=u[r]:"ref"==r?o=u[r]:f[r]=u[r];if(arguments.length>2&&(f.children=arguments.length>3?n.call(arguments,2):t),"function"==typeof l&&null!=l.defaultProps)for(r in l.defaultProps) void 0===f[r]&&(f[r]=l.defaultProps[r]);return d(l,f,i,o,null)}function d(n,t,i,o,r){var f={type:n,props:t,key:i,ref:o,__k:null,__:null,__b:0,__e:null,__d:void 0,__c:null,constructor:void 0,__v:null==r?++u:r,__i:-1,__u:0};return null!=l.vnode&&l.vnode(f),f}n=s.slice,l={__e:function(n,l,u,t){for(var i,o,r;l=l.__;)if((i=l.__c)&&!i.__)try{if((o=i.constructor)&&null!=o.getDerivedStateFromError&&(i.setState(o.getDerivedStateFromError(n)),r=i.__d),null!=i.componentDidCatch&&(i.componentDidCatch(n,t||{}),r=i.__d),r)return i.__E=i}catch(l){n=l;}throw n}},u=0,"function"==typeof Promise?Promise.prototype.then.bind(Promise.resolve()):setTimeout;

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
    return y('div', { class: 'bio-properties-panel-entry', style: 'padding: 0 10px 6px' }, y('button', {
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

function makeTextEntry$2(id, labelKey, prop) {
    return function Entry(props) {
        const { element } = props;
        const commandStack = useService('commandStack');
        const bpmnFactory = useService('bpmnFactory');
        const translate = useService('translate');
        const debounce = useService('debounceInput');
        const bo = element.businessObject;
        const getValue = () => getExtensionElement(bo, 'zenbpm:AssignmentDefinition')?.[prop] ?? '';
        const setValue = (value) => updateExtensionElementProps(element, bo, 'zenbpm:AssignmentDefinition', { [prop]: value }, bpmnFactory, commandStack);
        return TextFieldEntry({ element, id, label: translate(labelKey), getValue, setValue, debounce });
    };
}
const AssigneeEntry = makeTextEntry$2('zenbpm-assign-assignee', 'Assignee', 'assignee');
const CandidateGroupsEntry = makeTextEntry$2('zenbpm-assign-candidateGroups', 'Candidate groups', 'candidateGroups');
function AssignmentDefinitionProps(element) {
    if (element.type !== 'bpmn:UserTask')
        return [];
    return [
        { id: 'zenbpm-assign-assignee', component: AssigneeEntry, isEdited: isTextFieldEntryEdited },
        { id: 'zenbpm-assign-candidateGroups', component: CandidateGroupsEntry, isEdited: isTextFieldEntryEdited },
    ];
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function makeTextEntry$1(id, labelKey, prop) {
    return function Entry(props) {
        const { element } = props;
        const commandStack = useService('commandStack');
        const bpmnFactory = useService('bpmnFactory');
        const translate = useService('translate');
        const debounce = useService('debounceInput');
        const bo = element.businessObject;
        const getValue = () => getExtensionElement(bo, 'zenbpm:TaskSchedule')?.[prop] ?? '';
        const setValue = (value) => updateExtensionElementProps(element, bo, 'zenbpm:TaskSchedule', { [prop]: value }, bpmnFactory, commandStack);
        return TextFieldEntry({ element, id, label: translate(labelKey), getValue, setValue, debounce });
    };
}
const DueDateEntry = makeTextEntry$1('zenbpm-schedule-dueDate', 'Due date', 'dueDate');
const FollowUpDateEntry = makeTextEntry$1('zenbpm-schedule-followUpDate', 'Follow-up date', 'followUpDate');
// ─── exported entry list ─────────────────────────────────────────────────────
function TaskScheduleProps(element) {
    if (element.type !== 'bpmn:UserTask')
        return [];
    return [
        { id: 'zenbpm-schedule-dueDate', component: DueDateEntry, isEdited: isTextFieldEntryEdited },
        { id: 'zenbpm-schedule-followUpDate', component: FollowUpDateEntry, isEdited: isTextFieldEntryEdited },
    ];
}

const TYPE$2 = 'zenbpm:CalledElement';
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
    return TextFieldEntry({
        element,
        id: 'zenbpm-calledEl-processId',
        label: translate('Process ID'),
        getValue,
        setValue,
        debounce,
    });
}
function PropagateAllChildVarsEntry(props) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');
    const bo = element.businessObject;
    const getValue = () => getExtensionElement(bo, TYPE$2)?.propagateAllChildVariables ?? false;
    const setValue = (value) => updateExtensionElementProps(element, bo, TYPE$2, { propagateAllChildVariables: value }, bpmnFactory, commandStack);
    return ToggleSwitchEntry({
        element,
        id: 'zenbpm-calledEl-propagateAllChildVariables',
        label: translate('Propagate all child variables'),
        getValue,
        setValue,
    });
}
function PropagateAllParentVarsEntry(props) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');
    const bo = element.businessObject;
    const getValue = () => getExtensionElement(bo, TYPE$2)?.propagateAllParentVariables ?? true;
    const setValue = (value) => updateExtensionElementProps(element, bo, TYPE$2, { propagateAllParentVariables: value }, bpmnFactory, commandStack);
    return ToggleSwitchEntry({
        element,
        id: 'zenbpm-calledEl-propagateAllParentVariables',
        label: translate('Propagate all parent variables'),
        getValue,
        setValue,
    });
}
// ─── exported entry list ─────────────────────────────────────────────────────
function CalledElementProps(element) {
    if (element.type !== 'bpmn:CallActivity')
        return [];
    return [
        { id: 'zenbpm-calledEl-processId', component: ProcessIdEntry, isEdited: isTextFieldEntryEdited },
        { id: 'zenbpm-calledEl-propagateAllChildVariables', component: PropagateAllChildVarsEntry, isEdited: isToggleSwitchEntryEdited },
        { id: 'zenbpm-calledEl-propagateAllParentVariables', component: PropagateAllParentVarsEntry, isEdited: isToggleSwitchEntryEdited },
    ];
}

const TYPE$1 = 'zenbpm:CalledDecision';
function makeTextEntry(id, labelKey, prop) {
    return function Entry(props) {
        const { element } = props;
        const commandStack = useService('commandStack');
        const bpmnFactory = useService('bpmnFactory');
        const translate = useService('translate');
        const debounce = useService('debounceInput');
        const bo = element.businessObject;
        const getValue = () => getExtensionElement(bo, TYPE$1)?.[prop] ?? '';
        const setValue = (value) => updateExtensionElementProps(element, bo, TYPE$1, { [prop]: value }, bpmnFactory, commandStack);
        return TextFieldEntry({ element, id, label: translate(labelKey), getValue, setValue, debounce });
    };
}
const DecisionIdEntry = makeTextEntry('zenbpm-calledDecision-decisionId', 'Decision ID', 'decisionId');
const ResultVariableEntry = makeTextEntry('zenbpm-calledDecision-resultVariable', 'Result variable', 'resultVariable');
function CalledDecisionProps(element) {
    if (element.type !== 'bpmn:BusinessRuleTask')
        return [];
    return [
        { id: 'zenbpm-calledDecision-decisionId', component: DecisionIdEntry, isEdited: isTextFieldEntryEdited },
        { id: 'zenbpm-calledDecision-resultVariable', component: ResultVariableEntry, isEdited: isTextFieldEntryEdited },
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
    const getValue = () => lc.completionCondition?.body ?? '';
    const setValue = (value) => {
        if (!value) {
            commandStack.execute('element.updateModdleProperties', {
                element, moddleElement: lc, properties: { completionCondition: undefined },
            });
        }
        else if (lc.completionCondition) {
            commandStack.execute('element.updateModdleProperties', {
                element, moddleElement: lc.completionCondition, properties: { body: value },
            });
        }
        else {
            const expr = bpmnFactory.create('bpmn:FormalExpression', { body: value });
            commandStack.execute('element.updateModdleProperties', {
                element, moddleElement: lc, properties: { completionCondition: expr },
            });
        }
    };
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
        const getValue = () => {
            let val = param[prop] || '';
            if (prop === 'source' && val && !val.startsWith('=')) {
                val = '=' + val;
            }
            return val;
        };
        const setValue = (value) => {
            commandStack.execute('element.updateModdleProperties', {
                element,
                moddleElement: param,
                properties: { [prop]: value },
            });
        };
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
        add: () => addParam(element, bo, bpmnFactory, commandStack, 'zenbpm:Input', 'inputParameters'),
    };
}
function createOutputMappingGroup(element, injector) {
    if (!supportsOutputMapping(element))
        return null;
    const commandStack = injector.get('commandStack');
    const bpmnFactory = injector.get('bpmnFactory');
    const translate = injector.get('translate');
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
        add: () => addParam(element, bo, bpmnFactory, commandStack, 'zenbpm:Output', 'outputParameters'),
    };
}

function ConditionExpressionEntry(props) {
    const { element } = props;
    const commandStack = useService('commandStack');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');
    const debounce = useService('debounceInput');
    const bo = element.businessObject;
    const getValue = () => bo.conditionExpression?.body ?? '';
    const setValue = (value) => {
        if (!value) {
            commandStack.execute('element.updateModdleProperties', {
                element, moddleElement: bo, properties: { conditionExpression: undefined },
            });
        }
        else if (bo.conditionExpression) {
            commandStack.execute('element.updateModdleProperties', {
                element, moddleElement: bo.conditionExpression, properties: { body: value },
            });
        }
        else {
            const expr = bpmnFactory.create('bpmn:FormalExpression', { body: value });
            commandStack.execute('element.updateModdleProperties', {
                element, moddleElement: bo, properties: { conditionExpression: expr },
            });
        }
    };
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
            // ── Task Schedule ────────────────────────────────────────────────────
            if (element.type === 'bpmn:UserTask') {
                groups.push({
                    id: 'zenbpm-taskSchedule',
                    label: translate('Task schedule'),
                    entries: TaskScheduleProps(element),
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
            // ── Version Tag ──────────────────────────────────────────────────────
            if (element.type === 'bpmn:Process') {
                groups.push({
                    id: 'zenbpm-versionTag',
                    label: translate('Version tag'),
                    entries: VersionTagProps(element),
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

export { index as ZenBpmPropertiesProviderModule };
//# sourceMappingURL=index.mjs.map
