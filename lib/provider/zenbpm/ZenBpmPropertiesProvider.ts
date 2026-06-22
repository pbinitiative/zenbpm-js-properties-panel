import { Group, ListGroup } from '@bpmn-io/properties-panel';
import { ZenFormProps, setupFormSaveHandler } from './parts/ZenFormProps';
import { TaskDefinitionProps, isServiceTaskLike } from './parts/TaskDefinitionProps';
import { AssignmentDefinitionProps } from './parts/AssignmentDefinitionProps';
import { CalledElementProps } from './parts/CalledElementProps';
import { CalledDecisionProps } from './parts/CalledDecisionProps';
import { ImplementationProps, getImplementationType } from './parts/ImplementationProps';
import { VersionTagProps } from './parts/VersionTagProps';
import { MultiInstanceProps } from './parts/MultiInstanceProps';
import { createInputMappingGroup, createOutputMappingGroup } from './parts/IoMappingProps';
import { ConditionExpressionProps } from './parts/ConditionExpressionProps';
import { CorrelationKeyProps } from './parts/CorrelationKeyProps';
import { ExtensionPropertiesGroup } from './parts/ExtensionPropertiesProps';

const PROVIDER_PRIORITY = 500;

export class ZenBpmPropertiesProvider {
  static $inject = ['propertiesPanel', 'injector'];

  private _injector: any;

  constructor(propertiesPanel: any, injector: any) {
    this._injector = injector;
    propertiesPanel.registerProvider(PROVIDER_PRIORITY, this);

    // When the Zen Form editor is submitted, scan form field variables
    // and automatically add them to the output mapping.
    setupFormSaveHandler(injector);
  }

  getGroups(element: any) {
    return (groups: any[]) => {
      const translate = this._injector.get('translate');

      // ── Implementation (Business Rule Task only) ─────────────────────────
      if (element.type === 'bpmn:BusinessRuleTask') {
        groups.push({
          id: 'zenbpm-implementation',
          label: translate('Implementation'),
          entries: ImplementationProps(element),
          component: Group,
        });
      }

      // ── Task Definition ──────────────────────────────────────────────────
      // Shown for all service-task-like types except BusinessRuleTask, where it
      // is only shown when the implementation is set to Job worker.
      const showTaskDefinition =
        (isServiceTaskLike(element) && element.type !== 'bpmn:BusinessRuleTask') ||
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
      if (inputGroup) groups.push(inputGroup);

      // ── Output mapping ───────────────────────────────────────────────────
      const outputGroup = createOutputMappingGroup(element, this._injector);
      if (outputGroup) groups.push(outputGroup);

      // ── Multi-Instance ───────────────────────────────────────────────────
      // The standard bpmn-js-properties-panel adds zeebe:LoopCharacteristics
      // entries to the 'multiInstance' group. We replace the entire group with
      // our zenbpm:LoopCharacteristics entries to avoid duplicate fields.
      const multiInstanceEntries = MultiInstanceProps(element);
      if (multiInstanceEntries.length) {
        const existingGroupIdx = groups.findIndex((g: any) => g.id === 'multiInstance');
        if (existingGroupIdx !== -1) {
          groups[existingGroupIdx].entries = multiInstanceEntries;
        } else {
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
        const messageGroup = groups.find((g: any) => g.id === 'message');
        if (messageGroup) {
          messageGroup.entries = [...messageGroup.entries, ...correlationKeyEntries];
        } else {
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
        const conditionGroupIdx = groups.findIndex((g: any) => g.id === 'condition');
        if (conditionGroupIdx !== -1) {
          // Replace the standard entries with our FEEL entry
          groups[conditionGroupIdx].entries = conditionEntries;
        } else {
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
        const generalGroup = groups.find((g: any) => g.id === 'general');
        if (generalGroup) {
          generalGroup.entries = [...generalGroup.entries, ...versionTagEntries];
        } else {
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

      // ── Extension properties (zenbpm:Properties / zenbpm:Property) ──────
      // Generic key/value list available on any element. Mirrors Zeebe's
      // zeebe:Properties/zeebe:Property; in ZenBPM it is used to attach
      // arbitrary metadata (e.g. the ZEN_FORM JSON for a UserTask) and is
      // preserved on round-trip even though the engine does not read the
      // values at runtime.
      groups.push(ExtensionPropertiesGroup(element, this._injector));

      return groups;
    };
  }
}
