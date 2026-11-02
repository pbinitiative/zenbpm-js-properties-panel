import { expect } from 'chai';
import TestContainer from 'mocha-test-container-support';

import { act } from '@testing-library/preact';
import { query as domQuery } from 'min-dom';
import BpmnReplaceModule from 'bpmn-js/lib/features/replace';

import {
  bootstrapZenBpmPropertiesPanel,
  changeInput,
  findGroup,
  getBpmnJS,
  inject,
} from 'test/TestHelper';

import diagramXML from './fixtures/MessageThrowEvent.bpmn';

const TASK_DEFINITION_GROUP = 'zenbpm-taskDefinition';
const MESSAGE_GROUP = 'message';

describe('provider/zenbpm - message intermediate throw event', function() {
  let container: HTMLElement;

  beforeEach(function() {
    container = TestContainer.get(this);
  });

  beforeEach(bootstrapZenBpmPropertiesPanel(diagramXML, { additionalModules: [ BpmnReplaceModule ] }));

  async function select(elementRegistry: any, selection: any, id: string) {
    const element = elementRegistry.get(id);
    await act(() => {
      selection.select(element);
    });
    return element;
  }

  function getTaskDefinition(element: any) {
    return (element.businessObject.extensionElements?.values || []).find(
      (value: any) => value.$type === 'zenbpm:TaskDefinition'
    );
  }

  it('should render Task definition with Type and Retries instead of Message', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'MessageThrowEvent_1');

    const taskDefinitionGroup = findGroup(container, TASK_DEFINITION_GROUP);
    expect(taskDefinitionGroup, 'task definition group').to.exist;
    expect(domQuery('[data-entry-id="zenbpm-taskDef-type"]', taskDefinitionGroup), 'type entry').to.exist;
    expect(domQuery('[data-entry-id="zenbpm-taskDef-retries"]', taskDefinitionGroup), 'retries entry').to.exist;

    expect(findGroup(container, MESSAGE_GROUP), 'message group').not.to.exist;
  }));

  it('should hide Message even if the event references a global message', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'MessageThrowEvent_Configured');

    expect(findGroup(container, MESSAGE_GROUP), 'message group').not.to.exist;
    expect(findGroup(container, TASK_DEFINITION_GROUP), 'task definition group').to.exist;
  }));

  it('should show existing Task definition values', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'MessageThrowEvent_Configured');

    const typeInput = domQuery('input[name="zenbpm-taskDef-type"]', container) as HTMLInputElement;
    const retriesInput = domQuery('input[name="zenbpm-taskDef-retries"]', container) as HTMLInputElement;

    expect(typeInput.value).to.equal('notify-worker');
    expect(retriesInput.value).to.equal('5');
  }));

  it('should create TaskDefinition type and retries and persist them in the XML', inject(async function(elementRegistry, selection) {
    const event = await select(elementRegistry, selection, 'MessageThrowEvent_1');

    changeInput(domQuery('input[name="zenbpm-taskDef-type"]', container), 'notify-worker');
    changeInput(domQuery('input[name="zenbpm-taskDef-retries"]', container), '3');

    const taskDefinition = getTaskDefinition(event);
    expect(taskDefinition, 'task definition').to.exist;
    expect(taskDefinition.type).to.equal('notify-worker');
    expect(taskDefinition.retries).to.equal('3');

    const { xml } = await getBpmnJS().saveXML({ format: true });
    expect(xml).to.match(
      /<bpmn:intermediateThrowEvent id="MessageThrowEvent_1"[^>]*>\s*<bpmn:extensionElements>\s*<zenbpm:taskDefinition type="notify-worker" retries="3" \/>/
    );
  }));

  it('should keep the message reference, the global message and other extensions when configured', inject(async function(elementRegistry, selection) {
    const event = await select(elementRegistry, selection, 'MessageThrowEvent_Configured');

    changeInput(domQuery('input[name="zenbpm-taskDef-type"]', container), 'notify-worker-v2');

    const taskDefinitions = event.businessObject.extensionElements.values.filter(
      (value: any) => value.$type === 'zenbpm:TaskDefinition'
    );
    expect(taskDefinitions, 'task definitions').to.have.length(1);
    expect(taskDefinitions[0].type).to.equal('notify-worker-v2');
    expect(taskDefinitions[0].retries).to.equal('5');

    const { xml } = await getBpmnJS().saveXML({ format: true });
    expect(xml).to.contain('<bpmn:messageEventDefinition id="MessageEventDefinition_configured" messageRef="Message_1" />');
    expect(xml).to.contain('<bpmn:message id="Message_1" name="Message_1" />');
    expect(xml).to.contain('<zenbpm:input source="=orderId" target="orderId" />');
  }));

  it('should undo and redo the Task definition change', inject(async function(elementRegistry, selection, commandStack) {
    const event = await select(elementRegistry, selection, 'MessageThrowEvent_1');
    const typeInput = domQuery('input[name="zenbpm-taskDef-type"]', container) as HTMLInputElement;

    changeInput(typeInput, 'notify-worker');
    expect(getTaskDefinition(event)?.type).to.equal('notify-worker');

    await act(() => commandStack.undo());
    expect(getTaskDefinition(event), 'task definition after undo').not.to.exist;
    expect(typeInput.value).to.equal('');

    await act(() => commandStack.redo());
    expect(getTaskDefinition(event)?.type).to.equal('notify-worker');
    expect(typeInput.value).to.equal('notify-worker');
  }));

  it('should switch groups when replaced by a Signal throw event and back on undo', inject(async function(elementRegistry, selection, bpmnReplace, commandStack) {
    const event = await select(elementRegistry, selection, 'MessageThrowEvent_1');

    let signalEvent;
    await act(() => {
      signalEvent = bpmnReplace.replaceElement(event, {
        type: 'bpmn:IntermediateThrowEvent',
        eventDefinitionType: 'bpmn:SignalEventDefinition',
      });
    });
    await select(elementRegistry, selection, signalEvent.id);

    expect(findGroup(container, TASK_DEFINITION_GROUP), 'task definition group on signal').not.to.exist;
    expect(findGroup(container, 'signal'), 'signal group').to.exist;

    await act(() => commandStack.undo());
    await select(elementRegistry, selection, 'MessageThrowEvent_1');

    expect(findGroup(container, TASK_DEFINITION_GROUP), 'task definition group after undo').to.exist;
    expect(findGroup(container, MESSAGE_GROUP), 'message group after undo').not.to.exist;
  }));

  it('should show the same Task definition entries on a Send Task', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'SendTask_1');

    const taskDefinitionGroup = findGroup(container, TASK_DEFINITION_GROUP);
    expect(taskDefinitionGroup, 'task definition group').to.exist;
    expect(domQuery('[data-entry-id="zenbpm-taskDef-type"]', taskDefinitionGroup), 'type entry').to.exist;
    expect(domQuery('[data-entry-id="zenbpm-taskDef-retries"]', taskDefinitionGroup), 'retries entry').to.exist;
    expect(findGroup(container, MESSAGE_GROUP), 'message group').not.to.exist;
  }));

  describe('other event types remain unaffected', function() {

    for (const id of [ 'SignalThrowEvent_1', 'NoneThrowEvent_1' ]) {
      it(`should not render Task definition for ${id}`, inject(async function(elementRegistry, selection) {
        await select(elementRegistry, selection, id);

        expect(findGroup(container, TASK_DEFINITION_GROUP), 'task definition group').not.to.exist;
      }));
    }

    // Message End Events are job-based in the engine as well, but #889 is
    // limited to the intermediate throw event; this pins the current scope.
    // Update it together with the follow-up that moves end events to
    // Task definition.
    for (const id of [ 'MessageCatchEvent_1', 'MessageEndEvent_1' ]) {
      it(`should keep the Message group for ${id}`, inject(async function(elementRegistry, selection) {
        await select(elementRegistry, selection, id);

        expect(findGroup(container, MESSAGE_GROUP), 'message group').to.exist;
        expect(findGroup(container, TASK_DEFINITION_GROUP), 'task definition group').not.to.exist;
      }));
    }
  });
});
