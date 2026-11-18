import { expect } from 'chai';
import TestContainer from 'mocha-test-container-support';

import { act, fireEvent } from '@testing-library/preact';
import { query as domQuery, queryAll as domQueryAll } from 'min-dom';

import {
  bootstrapZenBpmPropertiesPanel,
  changeInput,
  findGroup,
  getBpmnJS,
  inject,
} from 'test/TestHelper';

import diagramXML from './fixtures/ExecutionListener.bpmn';
import collaborationXML from './fixtures/ExecutionListenerCollaboration.bpmn';

const GROUP = 'zenbpm-executionListener';

// Where the engine runs listeners, and so where the panel offers to create one.
const ELEMENTS_RUNNING_LISTENERS = [
  'StartEvent_Plain',
  'ServiceTask_1',
  'SendTask_1',
  'UserTask_1',
  'BusinessRuleTask_JobWorker',
  'ThrowEvent_Message',
  'ServiceTask_StandardLoop',
  'ServiceTask_InSubProcess',
  // a decision without an id is none to the engine, so the job worker does the task
  'BusinessRuleTask_UnnamedDecision',
];

// Where the engine runs none, and refuses one at deployment.
const ELEMENTS_RUNNING_NO_LISTENER = [
  'StartEvent_SubProcess',
  'StartEvent_EventSubProcess',
  'ServiceTask_MultiInstancePlain',
  'BusinessRuleTask_Dmn',
  'ThrowEvent_None',
  'ScriptTask_1',
  'ReceiveTask_1',
  'CallActivity_1',
  'Gateway_1',
  'EndEvent_1',
  'SubProcess_1',
];

function entryId(elementId: string, index: number, field: string) {
  return `${elementId}-zenbpm-executionListener-${index}-${field}`;
}

describe('provider/zenbpm - execution listeners', function() {
  let container: HTMLElement;

  beforeEach(function() {
    container = TestContainer.get(this);
  });

  beforeEach(bootstrapZenBpmPropertiesPanel(diagramXML));

  async function select(elementRegistry: any, selection: any, id: string) {
    const element = elementRegistry.get(id);
    await act(() => {
      selection.select(element);
    });
    return element;
  }

  function containersOf(element: any) {
    return (element.businessObject.extensionElements?.values || []).filter(
      (value: any) => value.$type === 'zenbpm:ExecutionListeners'
    );
  }

  // The listeners of the element's first executionListeners element, which is the only one of most elements.
  function getListeners(element: any) {
    return containersOf(element)[0]?.listeners;
  }

  function group() {
    return findGroup(container, GROUP);
  }

  function addButton() {
    return domQuery('.bio-properties-panel-add-entry', group()) as HTMLButtonElement | null;
  }

  function items() {
    return domQueryAll('.bio-properties-panel-collapsible-entry', group());
  }

  function itemLabels() {
    return Array.from(domQueryAll('.bio-properties-panel-collapsible-entry-header-title', group()))
      .map((title) => title.textContent);
  }

  function input(elementId: string, field: string, index = 0) {
    return domQuery(`[name="${entryId(elementId, index, field)}"]`, container) as HTMLInputElement | HTMLSelectElement;
  }

  function entryOf(field: HTMLElement) {
    return field.closest('.bio-properties-panel-entry') as HTMLElement;
  }

  // Whether the user sees the field: a closed group or list item takes its fields out of the layout.
  function isInView(field: HTMLElement) {
    return field.getClientRects().length > 0;
  }

  function errorOf(field: HTMLElement) {
    return domQuery('.bio-properties-panel-error', entryOf(field));
  }

  function descriptionOf(field: HTMLElement) {
    return domQuery('.bio-properties-panel-description', entryOf(field))?.textContent;
  }

  function optionsOf(field: HTMLElement) {
    return Array.from((field as HTMLSelectElement).options).map((option) => option.value);
  }

  async function add() {
    await act(() => addButton()!.click());
  }

  // Enter a field and leave it again without typing. The panel commits a field
  // when the focus leaves it, which its inputs learn from the `focusout` event
  // of the browser; a `blur` event does not reach them.
  async function leave(field: HTMLElement) {
    await act(() => {
      field.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      field.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
  }

  function groupIsOpen() {
    return domQuery('.bio-properties-panel-list.open', group()) !== null;
  }

  async function toggleGroup() {
    await act(() => (domQuery('.bio-properties-panel-group-header', group()) as HTMLElement).click());
  }

  async function toggleItem(index = 0) {
    await act(() => (domQuery('.bio-properties-panel-collapsible-entry-header', items()[index]) as HTMLElement).click());
  }

  async function removeItem(index = 0) {
    await act(() => (domQueryAll('.bio-properties-panel-remove-entry', group())[index] as HTMLButtonElement).click());
  }

  async function elementXml(id: string) {
    const { xml } = await getBpmnJS().saveXML({ format: true });
    return xml.match(new RegExp(`<bpmn:(\\w+) id="${id}"[\\s\\S]*?</bpmn:\\1>`))?.[0];
  }

  // The attributes of each listener in the XML, in its order there, whatever the order of the attributes.
  function listenersIn(xml: string | undefined) {
    return [ ...(xml ?? '').matchAll(/<zenbpm:executionListener ([^>]*)\/>/g) ].map(([ , tag ]) =>
      Object.fromEntries([ ...tag.matchAll(/(\w+)="([^"]*)"/g) ].map(([ , name, value ]) => [ name, value ]))
    );
  }

  for (const id of ELEMENTS_RUNNING_LISTENERS) {
    it(`should offer to create a listener on ${id}, where the engine runs listeners`, inject(async function(elementRegistry, selection) {
      await select(elementRegistry, selection, id);

      expect(group(), 'execution listeners group').to.exist;
      expect(addButton(), 'create button').to.exist;
      expect(items(), 'no listener yet').to.have.length(0);
    }));
  }

  for (const id of ELEMENTS_RUNNING_NO_LISTENER) {
    it(`should offer no listener on ${id}, where the engine runs none`, inject(async function(elementRegistry, selection) {
      await select(elementRegistry, selection, id);

      expect(group(), 'execution listeners group').not.to.exist;
    }));
  }

  it('should show the event type, type and retries of an existing listener, and offer one more', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'StartEvent_Listener');

    expect(items()).to.have.length(1);
    expect(input('StartEvent_Listener', 'eventType').value).to.equal('end');
    expect(input('StartEvent_Listener', 'type').value).to.equal('order-started');
    expect(input('StartEvent_Listener', 'retries').value).to.equal('3');
    expect(errorOf(input('StartEvent_Listener', 'eventType')), 'the engine runs it').not.to.exist;
    expect(addButton(), 'the engine runs several listeners on one element').to.exist;
  }));

  it('should create a start listener on a task, take the type entered and persist it in the XML', inject(async function(elementRegistry, selection) {
    const task = await select(elementRegistry, selection, 'ServiceTask_1');

    await add();
    expect(getListeners(task), 'listeners').to.have.length(1);
    expect(getListeners(task)[0].eventType).to.equal('start');
    expect(errorOf(input('ServiceTask_1', 'eventType')), 'a start listener is run on a task').not.to.exist;
    expect(errorOf(input('ServiceTask_1', 'type'))?.textContent, 'a type is still missing').to.match(/Enter the job type/);

    changeInput(input('ServiceTask_1', 'type'), 'reserve-stock');
    changeInput(input('ServiceTask_1', 'retries'), '5');

    expect(await elementXml('ServiceTask_1')).to.match(
      /<bpmn:extensionElements>\s*<zenbpm:executionListeners>\s*<zenbpm:executionListener [^>]*\/>\s*<\/zenbpm:executionListeners>/
    );
    expect(listenersIn(await elementXml('ServiceTask_1'))).to.eql([ { eventType: 'start', retries: '5', type: 'reserve-stock' } ]);

    changeInput(input('ServiceTask_1', 'retries'), '');
    expect(getListeners(task)[0].retries, 'empty retries are left out').to.be.undefined;
  }));

  it('should create an end listener on a start event, which takes no other', inject(async function(elementRegistry, selection) {
    const event = await select(elementRegistry, selection, 'StartEvent_Plain');

    await add();
    changeInput(input('StartEvent_Plain', 'type'), 'order-started');

    expect(getListeners(event)[0].eventType).to.equal('end');
    expect(errorOf(input('StartEvent_Plain', 'eventType')), 'an end listener is run on a start event').not.to.exist;
    expect(listenersIn(await elementXml('StartEvent_Plain'))).to.eql([ { eventType: 'end', type: 'order-started' } ]);
  }));

  it('should append a second listener behind the first, open it and keep the order of the model in the XML', inject(async function(elementRegistry, selection) {
    const task = await select(elementRegistry, selection, 'ServiceTask_1');

    await add();
    changeInput(input('ServiceTask_1', 'type'), 'reserve-stock');
    await add();
    // the new item is opened by an event fired after the listener was created
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    await act(() => fireEvent.change(input('ServiceTask_1', 'eventType', 1), { target: { value: 'end' } }));
    changeInput(input('ServiceTask_1', 'type', 1), 'notify-customer');

    expect(getListeners(task).map((listener: any) => listener.type)).to.eql([ 'reserve-stock', 'notify-customer' ]);
    expect(items()[1].classList.contains('open'), 'the new listener is open').to.be.true;
    expect(listenersIn(await elementXml('ServiceTask_1'))).to.eql([
      { eventType: 'start', type: 'reserve-stock' },
      { eventType: 'end', type: 'notify-customer' },
    ]);
  }));

  it('should offer Start and End as event types on a task, and only End on a start event', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'ServiceTask_Chain');
    expect(optionsOf(input('ServiceTask_Chain', 'eventType'))).to.eql([ 'start', 'end' ]);

    await select(elementRegistry, selection, 'StartEvent_Listener');
    expect(optionsOf(input('StartEvent_Listener', 'eventType'))).to.eql([ 'end' ]);
  }));

  it('should list a chain in the order of the model, each listener named by its event type and type', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'ServiceTask_Chain');

    expect(itemLabels()).to.eql([
      'Start: reserve-stock',
      'End: notify-customer',
      'Start: check-credit',
      'End: archive-order',
    ]);
    for (const index of [ 0, 1, 2, 3 ]) {
      expect(errorOf(input('ServiceTask_Chain', 'eventType', index)), `event type of listener ${index}`).not.to.exist;
      expect(errorOf(input('ServiceTask_Chain', 'type', index)), `type of listener ${index}`).not.to.exist;
    }
  }));

  it('should name a listener without a type by its event type alone', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'ServiceTask_1');

    await add();

    expect(itemLabels()).to.eql([ 'Start: <no type>' ]);
  }));

  it('should say when a worker completes the job of a start listener and of an end listener', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'ServiceTask_Chain');

    expect(descriptionOf(input('ServiceTask_Chain', 'type', 0))).to.match(/before the element's own work starts/);
    expect(descriptionOf(input('ServiceTask_Chain', 'type', 1))).to.match(/before the token leaves the element/);
  }));

  it('should accept several end listeners on a start event, and remove one of them', inject(async function(elementRegistry, selection) {
    const event = await select(elementRegistry, selection, 'StartEvent_TwoListeners');

    expect(items()).to.have.length(2);
    for (const index of [ 0, 1 ]) {
      expect(errorOf(input('StartEvent_TwoListeners', 'eventType', index)), `event type of listener ${index}`).not.to.exist;
      expect(errorOf(input('StartEvent_TwoListeners', 'type', index)), `type of listener ${index}`).not.to.exist;
    }

    await removeItem(1);

    expect(getListeners(event).map((listener: any) => listener.type)).to.eql([ 'first' ]);
  }));

  it('should remove one listener of a chain and keep the others in their order', inject(async function(elementRegistry, selection) {
    const task = await select(elementRegistry, selection, 'ServiceTask_Chain');

    await removeItem(1);

    expect(getListeners(task).map((listener: any) => listener.type)).to.eql([ 'reserve-stock', 'check-credit', 'archive-order' ]);
    expect(itemLabels()).to.eql([ 'Start: reserve-stock', 'Start: check-credit', 'End: archive-order' ]);
  }));

  it('should update the type of an existing listener in place', inject(async function(elementRegistry, selection) {
    const event = await select(elementRegistry, selection, 'StartEvent_Listener');

    changeInput(input('StartEvent_Listener', 'type'), 'order-received');

    const listeners = getListeners(event);
    expect(listeners, 'listeners').to.have.length(1);
    expect(listeners[0].type).to.equal('order-received');
    expect(listeners[0].retries).to.equal('3');
  }));

  it('should keep the other attributes of a listener while its type is cleared and retyped', inject(async function(elementRegistry, selection) {
    const event = await select(elementRegistry, selection, 'StartEvent_Backoff');

    changeInput(input('StartEvent_Backoff', 'type'), '');
    await act(() => {});
    expect(getListeners(event), 'the listener stays').to.have.length(1);
    expect(errorOf(input('StartEvent_Backoff', 'type'))?.textContent).to.match(/Enter the job type/);

    changeInput(input('StartEvent_Backoff', 'type'), 'order-received');

    expect(listenersIn(await elementXml('StartEvent_Backoff'))).to.eql([
      { eventType: 'end', retries: '5', retryBackoff: 'PT10S', type: 'order-received' },
    ]);
  }));

  it('should remove the listener with its delete button and keep the other extensions', inject(async function(elementRegistry, selection) {
    const event = await select(elementRegistry, selection, 'StartEvent_Listener');

    await removeItem();

    expect(getListeners(event), 'listeners').to.be.undefined;
    expect(addButton(), 'a listener can be created again').to.exist;
    const startEvent = await elementXml('StartEvent_Listener');
    expect(startEvent, 'start event in the XML').to.exist;
    expect(startEvent).not.to.contain('executionListener');
    expect(startEvent).to.contain('<zenbpm:output source="=orderId" target="orderId" />');
  }));

  it('should leave no empty extension elements behind when the last extension is removed', inject(async function(elementRegistry, selection) {
    const event = await select(elementRegistry, selection, 'StartEvent_OnlyListener');

    await removeItem();

    expect(event.businessObject.extensionElements, 'extension elements').to.be.undefined;
  }));

  it('should explain that a listener takes no FEEL expression', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'StartEvent_Listener');

    changeInput(input('StartEvent_Listener', 'type'), '=jobType');
    await act(() => {});
    expect(errorOf(input('StartEvent_Listener', 'type'))?.textContent).to.match(/literal/);

    changeInput(input('StartEvent_Listener', 'retries'), '=retries');
    await act(() => {});
    expect(errorOf(input('StartEvent_Listener', 'retries'))?.textContent).to.match(/literal/);
  }));

  it('should refuse retries the engine does not read', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'StartEvent_Listener');
    const retries = () => input('StartEvent_Listener', 'retries');

    for (const value of [ '-1', '1.5', 'three', '2147483648' ]) {
      changeInput(retries(), value);
      await act(() => {});
      expect(errorOf(retries())?.textContent, value).to.equal('Enter a whole number from 0 to 2147483647');
    }

    changeInput(retries(), '2147483647');
    await act(() => {});
    expect(errorOf(retries()), 'the int32 maximum is fine').not.to.exist;
  }));

  it('should accept retries as the engine reads them, a sign and leading zeros included', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'StartEvent_Listener');
    const retries = () => input('StartEvent_Listener', 'retries');

    for (const value of [ '+3', '-0', '007', '0' ]) {
      changeInput(retries(), value);
      await act(() => {});
      expect(errorOf(retries()), value).not.to.exist;
    }

    for (const value of [ '+', '1_000', '0x10' ]) {
      changeInput(retries(), value);
      await act(() => {});
      expect(errorOf(retries())?.textContent, value).to.equal('Enter a whole number from 0 to 2147483647');
    }
  }));

  it('should add no undo step when an empty Retries field is left untouched', inject(async function(elementRegistry, selection, commandStack) {
    await select(elementRegistry, selection, 'StartEvent_OnlyListener');

    const retries = input('StartEvent_OnlyListener', 'retries');
    await leave(retries);

    expect(commandStack.canUndo(), 'undo step').to.be.false;
  }));

  it('should add no undo step when the field of an attribute the model carries empty is left untouched', inject(async function(elementRegistry, selection, commandStack) {
    const task = await select(elementRegistry, selection, 'ServiceTask_EmptyAttributes');
    expect(getListeners(task)[0].type, 'type as imported').to.equal('');
    expect(getListeners(task)[0].retries, 'retries as imported').to.equal('');

    for (const field of [ 'type', 'retries' ]) {
      await leave(input('ServiceTask_EmptyAttributes', field));
    }

    expect(commandStack.canUndo(), 'undo step').to.be.false;
    expect(errorOf(input('ServiceTask_EmptyAttributes', 'type'))?.textContent).to.match(/Enter the job type/);
  }));

  it('should show a start listener on a start event with the reason, and set it to End', inject(async function(elementRegistry, selection) {
    const event = await select(elementRegistry, selection, 'StartEvent_StartListener');

    const eventType = input('StartEvent_StartListener', 'eventType') as HTMLSelectElement;
    expect(eventType.value).to.equal('start');
    expect(optionsOf(eventType), 'the value of the model stays an option').to.eql([ 'end', 'start' ]);
    expect(errorOf(eventType)?.textContent).to.equal('Choose End: a start event takes only end listeners');

    await act(() => fireEvent.change(eventType, { target: { value: 'end' } }));

    expect(getListeners(event)[0].eventType).to.equal('end');
    expect(errorOf(input('StartEvent_StartListener', 'eventType')), 'no error once End').not.to.exist;
  }));

  it('should show an event type the engine does not run on a task with the reason, until Start or End is chosen', inject(async function(elementRegistry, selection) {
    const task = await select(elementRegistry, selection, 'ServiceTask_UnknownEventType');

    const eventType = input('ServiceTask_UnknownEventType', 'eventType') as HTMLSelectElement;
    expect(eventType.value, 'the engine compares the event type as it is written').to.equal('End');
    expect(itemLabels()).to.eql([ 'End: audit' ]);
    expect(errorOf(eventType)?.textContent).to.equal('Choose Start or End: the engine runs no listener of another event type');

    await act(() => fireEvent.change(eventType, { target: { value: 'end' } }));

    expect(getListeners(task)[0].eventType).to.equal('end');
    expect(errorOf(input('ServiceTask_UnknownEventType', 'eventType')), 'no error once End').not.to.exist;
  }));

  it('should flag both listeners of one event type with the same type, whatever the whitespace around it', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'ServiceTask_Duplicate');
    const type = (index: number) => input('ServiceTask_Duplicate', 'type', index);

    expect(errorOf(type(0))?.textContent).to.equal('Enter another job type: two listeners of one event type need different types');
    expect(errorOf(type(1)), 'the end listener of the same type').not.to.exist;
    expect(errorOf(type(2))?.textContent).to.match(/Enter another job type/);

    changeInput(type(2), 'audit-credit');
    await act(() => {});

    expect(errorOf(type(0)), 'first start listener once the types differ').not.to.exist;
    expect(errorOf(type(2)), 'second start listener once the types differ').not.to.exist;
  }));

  it('should show the reason of the value typed over one the model came with, and none once it is corrected', inject(async function(elementRegistry, selection) {
    const task = await select(elementRegistry, selection, 'ServiceTask_Duplicate');
    const type = () => input('ServiceTask_Duplicate', 'type', 2);
    expect(errorOf(type())?.textContent, 'as the model came').to.match(/^Enter another job type/);

    // a value the engine refuses for another reason is kept as typed, with its own reason
    changeInput(type(), '=jobType');
    await act(() => {});
    expect(errorOf(type())?.textContent, 'an expression typed over it').to.equal('Enter the job type as a literal: a listener takes no FEEL expression');
    expect(getListeners(task)[2].type).to.equal('=jobType');

    changeInput(type(), 'audit');
    await act(() => {});
    expect(errorOf(type())?.textContent, 'the type of the first start listener typed over it').to.match(/^Enter another job type/);

    changeInput(type(), 'audit-credit');
    await act(() => {});
    expect(errorOf(type()), 'once corrected').not.to.exist;
  }));

  it('should flag a listener on an element without an outgoing sequence flow, as flows are drawn, undone and redone', inject(async function(elementRegistry, selection, modeling, commandStack) {
    const task = await select(elementRegistry, selection, 'ServiceTask_NoOutgoing');
    const error = () => errorOf(input('ServiceTask_NoOutgoing', 'eventType'))?.textContent;

    expect(error()).to.match(/^Connect an outgoing sequence flow/);

    // the task stays selected: a flow is no change of the task to the modeler, but it is one to its listeners
    await act(() => modeling.connect(task, elementRegistry.get('EndEvent_1')));
    expect(error(), 'once connected').not.to.exist;

    await act(() => commandStack.undo());
    expect(error(), 'once the flow is undone').to.match(/^Connect an outgoing sequence flow/);

    await act(() => commandStack.redo());
    expect(error(), 'once the flow is redone').not.to.exist;
  }));

  it('should flag the listeners of an element whose outgoing sequence flow is removed, until that is undone', inject(async function(elementRegistry, selection, modeling, commandStack) {
    await select(elementRegistry, selection, 'ServiceTask_Chain');
    const error = () => errorOf(input('ServiceTask_Chain', 'eventType'))?.textContent;
    expect(error(), 'with its flow').not.to.exist;

    await act(() => modeling.removeConnection(elementRegistry.get('Flow_ServiceTask_Chain')));
    expect(error(), 'once the flow is removed').to.match(/^Connect an outgoing sequence flow/);

    await act(() => commandStack.undo());
    expect(error(), 'once the removal is undone').not.to.exist;
  }));

  it('should flag the listeners of an element whose outgoing sequence flow is reconnected to leave another', inject(async function(elementRegistry, selection, modeling) {
    await select(elementRegistry, selection, 'ServiceTask_Chain');
    const flow = elementRegistry.get('Flow_ServiceTask_Chain');

    await act(() => modeling.reconnectStart(flow, elementRegistry.get('ServiceTask_NoOutgoing'), { x: 150, y: 340 }));

    expect(errorOf(input('ServiceTask_Chain', 'eventType'))?.textContent).to.match(/^Connect an outgoing sequence flow/);
  }));

  it('should report the source of a drawn sequence flow as changed, and of no other connection', inject(async function(elementRegistry, modeling, eventBus) {
    const task = elementRegistry.get('ServiceTask_NoOutgoing');
    const annotation = modeling.createShape({ type: 'bpmn:TextAnnotation' }, { x: 150, y: 480 }, task.parent);
    let reportsOfTheTask = 0;
    eventBus.on('elements.changed', ({ elements }: any) => {
      if (elements.includes(task)) reportsOfTheTask++;
    });

    const association = modeling.connect(task, annotation);
    expect(association.type).to.equal('bpmn:Association');
    expect(reportsOfTheTask, 'an association says nothing about the listeners of its source').to.equal(0);

    const flow = modeling.connect(task, elementRegistry.get('EndEvent_1'));
    expect(flow.type).to.equal('bpmn:SequenceFlow');
    expect(reportsOfTheTask, 'a sequence flow lets the listeners of its source run').to.equal(1);
  }));

  it('should show a listener on a multi-instance activity with the reason, and offer no further one', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'ServiceTask_MultiInstance');

    expect(addButton(), 'no listener is offered there').not.to.exist;
    expect(optionsOf(input('ServiceTask_MultiInstance', 'eventType')), 'only the value of the model').to.eql([ 'start' ]);
    expect(errorOf(input('ServiceTask_MultiInstance', 'eventType'))?.textContent).to.match(/no listener on a multi-instance activity/);
  }));

  it('should show a listener on a business rule task which calls a decision with the reason, and accept it once a job worker with a type does the task', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'BusinessRuleTask_DmnListener');
    const error = () => errorOf(input('BusinessRuleTask_DmnListener', 'eventType'))?.textContent;

    expect(addButton(), 'no listener is offered there').not.to.exist;
    expect(error()).to.match(/choose the Job worker implementation/);

    // choosing Job worker leaves a task definition without a type, which is no job worker's task to the engine yet
    const implementation = domQuery('[name="zenbpm-implementation-type"]', container) as HTMLSelectElement;
    await act(() => fireEvent.change(implementation, { target: { value: 'jobWorker' } }));
    expect(error(), 'without a job type').to.match(/^Enter the Type of the task definition/);
    expect(addButton(), 'no listener is offered yet').not.to.exist;

    changeInput(domQuery('[name="zenbpm-taskDef-type"]', container), 'rules');
    await act(() => {});

    expect(error(), 'no error once a job worker does the task').not.to.exist;
    expect(addButton(), 'a further listener is offered').to.exist;
  }));

  it('should show a listener on a business rule task whose task definition has no type with the reason', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'BusinessRuleTask_NoType');

    expect(addButton(), 'no listener is offered there').not.to.exist;
    expect(errorOf(input('BusinessRuleTask_NoType', 'eventType'))?.textContent).to.equal(
      'Enter the Type of the task definition: the engine runs listeners on a business rule task only once a job worker does it'
    );
  }));

  it('should show a listener on a business rule task which names a decision beside a job type with the reason: the engine calls the decision', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'BusinessRuleTask_DecisionAndJobWorker');

    // the Implementation entry reads Job worker there, which the engine does not follow
    expect((domQuery('[name="zenbpm-implementation-type"]', container) as HTMLSelectElement).value).to.equal('jobWorker');
    expect(addButton(), 'no listener is offered there').not.to.exist;
    expect(errorOf(input('BusinessRuleTask_DecisionAndJobWorker', 'eventType'))?.textContent).to.match(
      /^Remove this listener or the called decision of the task/
    );
  }));

  it('should show a listener on the process as one the engine ignores, not as one it refuses, so that it can be removed', inject(async function(canvas, selection) {
    await act(() => selection.select([]));
    const process = canvas.getRootElement();

    expect(group(), 'execution listeners group').to.exist;
    expect(addButton(), 'no listener is offered there').not.to.exist;
    expect(descriptionOf(input('Process_1', 'eventType'))).to.equal(
      'The engine runs no listener on the process itself and ignores this one. It can be removed.'
    );
    expect(errorOf(input('Process_1', 'eventType')), 'the engine deploys the model').not.to.exist;
    expect(domQuery('.bio-properties-panel-list-badge--error', group()), 'badge of the group').not.to.exist;
    expect(groupIsOpen(), 'a group without a flagged listener').to.be.false;

    // what the listener holds says nothing to an engine which does not read it
    await toggleGroup();
    changeInput(input('Process_1', 'type'), '');
    changeInput(input('Process_1', 'retries'), '=retries');
    await act(() => {});
    expect(errorOf(input('Process_1', 'type')), 'an empty type').not.to.exist;
    expect(errorOf(input('Process_1', 'retries')), 'retries as an expression').not.to.exist;
    expect(domQuery('.bio-properties-panel-list-badge--error', group()), 'badge of the group').not.to.exist;

    await removeItem();

    expect(process.businessObject.extensionElements, 'extension elements').to.be.undefined;
    expect(group(), 'execution listeners group').not.to.exist;
  }));

  it('should give a listener where the engine runs none the one reason, whatever its attributes hold', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'ServiceTask_MultiInstance');

    changeInput(input('ServiceTask_MultiInstance', 'type'), '');
    changeInput(input('ServiceTask_MultiInstance', 'retries'), '-1');
    await act(() => {});

    expect(errorOf(input('ServiceTask_MultiInstance', 'eventType'))?.textContent).to.match(/^Remove this listener or the multi-instance marker/);
    expect(errorOf(input('ServiceTask_MultiInstance', 'type')), 'an empty type beside "Remove this listener"').not.to.exist;
    expect(errorOf(input('ServiceTask_MultiInstance', 'retries')), 'retries below zero beside "Remove this listener"').not.to.exist;
  }));

  it('should flag the attributes of a listener once the engine runs it', inject(async function(elementRegistry, selection, modeling) {
    const task = await select(elementRegistry, selection, 'ServiceTask_MultiInstance');
    changeInput(input('ServiceTask_MultiInstance', 'type'), '');
    await act(() => {});

    await act(() => modeling.updateProperties(task, { loopCharacteristics: undefined }));

    expect(errorOf(input('ServiceTask_MultiInstance', 'eventType')), 'no multi-instance activity any more').not.to.exist;
    expect(errorOf(input('ServiceTask_MultiInstance', 'type'))?.textContent).to.match(/Enter the job type/);
  }));

  it('should show a listener on a start event inside a sub-process with the reason, so that it can be removed', inject(async function(elementRegistry, selection) {
    const event = await select(elementRegistry, selection, 'StartEvent_SubProcessListener');

    expect(group(), 'execution listeners group').to.exist;
    expect(addButton(), 'no listener is offered there').not.to.exist;
    expect(errorOf(input('StartEvent_SubProcessListener', 'eventType'))?.textContent).to.match(/only directly under the process/);

    await removeItem();

    expect(event.businessObject.extensionElements, 'extension elements').to.be.undefined;
    expect(group(), 'execution listeners group').not.to.exist;
  }));

  it('should flag the listener of a start event moved into a sub-process', inject(async function(elementRegistry, selection, modeling) {
    const event = elementRegistry.get('StartEvent_Listener');
    const subProcess = elementRegistry.get('SubProcess_1');

    await act(() => modeling.moveElements([ event ], { x: 0, y: 400 }, subProcess));
    await select(elementRegistry, selection, 'StartEvent_Listener');

    expect(event.businessObject.$parent.id).to.equal('SubProcess_1');
    expect(errorOf(input('StartEvent_Listener', 'eventType'))?.textContent).to.match(/only directly under the process/);
  }));

  it('should list the listeners of every executionListeners element in the order of the model', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'ServiceTask_TwoContainers');

    expect(itemLabels()).to.eql([ 'Start: visible', 'Start: hidden' ]);

    await select(elementRegistry, selection, 'ServiceTask_EmptyFirstContainer');

    expect(itemLabels(), 'behind an empty executionListeners element').to.eql([ 'End: later' ]);
  }));

  it('should remove a listener from its own executionListeners element and keep those of another', inject(async function(elementRegistry, selection) {
    const task = await select(elementRegistry, selection, 'ServiceTask_TwoContainers');

    await removeItem(0);

    expect(itemLabels()).to.eql([ 'Start: hidden' ]);
    expect(listenersIn(await elementXml('ServiceTask_TwoContainers'))).to.eql([ { eventType: 'start', type: 'hidden' } ]);
    expect(containersOf(task), 'the emptied executionListeners element is gone').to.have.length(1);

    await removeItem(0);

    expect(task.businessObject.extensionElements, 'extension elements').to.be.undefined;
  }));

  it('should add a listener behind those of the last executionListeners element', inject(async function(elementRegistry, selection) {
    const task = await select(elementRegistry, selection, 'ServiceTask_TwoContainers');

    await add();
    changeInput(input('ServiceTask_TwoContainers', 'type', 2), 'added');

    expect(listenersIn(await elementXml('ServiceTask_TwoContainers')).map((listener) => listener.type)).to.eql([ 'visible', 'hidden', 'added' ]);
    expect(containersOf(task).map((listeners: any) => listeners.listeners.length)).to.eql([ 1, 2 ]);
  }));

  it('should flag the same event type and type in two executionListeners elements, which the engine reads as one list', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'ServiceTask_TwoContainers');

    changeInput(input('ServiceTask_TwoContainers', 'type', 1), 'visible');
    await act(() => {});

    for (const index of [ 0, 1 ]) {
      expect(errorOf(input('ServiceTask_TwoContainers', 'type', index))?.textContent, `listener ${index}`).to.match(/Enter another job type/);
    }
  }));

  it('should mark the group of an element with a listener the engine does not run, and open it by itself', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'ServiceTask_MultiInstance');

    expect(domQuery('.bio-properties-panel-list-badge--error', group()), 'badge of the group').to.exist;
    expect(groupIsOpen(), 'a group with a flagged listener').to.be.true;

    await toggleGroup();
    await select(elementRegistry, selection, 'ServiceTask_Chain');

    expect(domQuery('.bio-properties-panel-list-badge', group()), 'badge of the group').to.exist;
    expect(domQuery('.bio-properties-panel-list-badge--error', group()), 'badge of a group the engine runs').not.to.exist;
  }));

  it('should keep the group open and the field in view while the last flagged value is corrected', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'ServiceTask_BackoffExpression');
    await toggleItem();
    const backoff = () => input('ServiceTask_BackoffExpression', 'retryBackoff');
    expect(isInView(backoff()), 'the flagged field, before').to.be.true;

    changeInput(backoff(), 'PT10S');
    await act(() => {});

    expect(domQuery('.bio-properties-panel-list-badge--error', group()), 'badge once corrected').not.to.exist;
    expect(groupIsOpen(), 'the group once corrected').to.be.true;
    expect(isInView(backoff()), 'the field once corrected').to.be.true;
  }));

  it('should keep the group open when the flagged listener is removed', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'ServiceTask_Duplicate');
    expect(groupIsOpen(), 'with two listeners of the same type').to.be.true;

    await removeItem(2);

    expect(domQuery('.bio-properties-panel-list-badge--error', group()), 'badge once removed').not.to.exist;
    expect(groupIsOpen(), 'the group once removed').to.be.true;
  }));

  it('should leave a group the user closed as it is, and open it for the next element with a flagged listener', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'ServiceTask_MultiInstance');
    await toggleGroup();
    expect(groupIsOpen(), 'once closed').to.be.false;

    // a change of the element shows it anew, and is no reason to open what the user closed
    changeInput(input('ServiceTask_MultiInstance', 'retries'), '5');
    await act(() => {});
    expect(groupIsOpen(), 'after a change of the element').to.be.false;

    await select(elementRegistry, selection, 'ServiceTask_Chain');
    expect(groupIsOpen(), 'on an element without a flagged listener').to.be.false;

    await select(elementRegistry, selection, 'ServiceTask_BackoffExpression');
    expect(groupIsOpen(), 'on the next element with a flagged listener').to.be.true;
  }));

  it('should mark the group for a missing type as well, until it is entered', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'ServiceTask_1');

    await add();
    expect(domQuery('.bio-properties-panel-list-badge--error', group()), 'without a type').to.exist;

    changeInput(input('ServiceTask_1', 'type'), 'reserve-stock');
    await act(() => {});

    expect(domQuery('.bio-properties-panel-list-badge--error', group()), 'with a type').not.to.exist;
  }));

  it('should keep a listener open when the one before it is removed', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'ServiceTask_Chain');
    const openLabels = () => Array.from(items())
      .filter((item) => item.classList.contains('open'))
      .map((item) => domQuery('.bio-properties-panel-collapsible-entry-header-title', item)?.textContent);

    await act(() => (domQuery('.bio-properties-panel-collapsible-entry-header', items()[2]) as HTMLElement).click());
    expect(openLabels()).to.eql([ 'Start: check-credit' ]);

    await removeItem(0);

    expect(itemLabels()).to.eql([ 'End: notify-customer', 'Start: check-credit', 'End: archive-order' ]);
    expect(openLabels(), 'the listener the user opened').to.eql([ 'Start: check-credit' ]);
  }));

  it('should give the listeners of a model read anew the list items they had', inject(async function(elementRegistry, selection) {
    const itemIds = () => Array.from(items()).map((item) => item.getAttribute('data-entry-id'));

    await select(elementRegistry, selection, 'ServiceTask_Chain');
    const before = itemIds();
    expect(before).to.have.length(4);

    const { xml } = await getBpmnJS().saveXML();
    await act(() => getBpmnJS().importXML(xml));
    await select(getBpmnJS().get('elementRegistry'), getBpmnJS().get('selection'), 'ServiceTask_Chain');

    expect(itemIds()).to.eql(before);
  }));

  it('should show the retry backoff a listener came with, and offer none to enter for another', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'StartEvent_Backoff');
    expect(input('StartEvent_Backoff', 'retryBackoff').value).to.equal('PT10S');
    expect(errorOf(input('StartEvent_Backoff', 'retryBackoff')), 'a backoff the engine reads').not.to.exist;

    await select(elementRegistry, selection, 'StartEvent_Listener');
    expect(input('StartEvent_Listener', 'retryBackoff'), 'no backoff in the model').not.to.exist;

    await add();
    expect(input('StartEvent_Listener', 'retryBackoff', 1), 'no backoff for a new listener').not.to.exist;
  }));

  it('should flag a retry backoff the engine refuses, and take a corrected one', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'ServiceTask_BackoffExpression');
    const backoff = () => input('ServiceTask_BackoffExpression', 'retryBackoff');

    expect(errorOf(backoff())?.textContent).to.equal('Enter the retry backoff as a literal: a listener takes no FEEL expression');
    expect(domQuery('.bio-properties-panel-list-badge--error', group()), 'badge of the group').to.exist;

    for (const value of [ 'P1M', 'P1Y2D', 'PT10S,P1M' ]) {
      changeInput(backoff(), value);
      await act(() => {});
      expect(errorOf(backoff())?.textContent, value).to.match(/^Enter the retry backoff in weeks, days, hours, minutes or seconds/);
    }
    for (const value of [ 'not-a-duration', 'P', 'PT', 'P1DT', 'PT1.5S', 'pt10s', 'PT10S,', '-PT10S', 'PT1M1H', 'P1H' ]) {
      changeInput(backoff(), value);
      await act(() => {});
      expect(errorOf(backoff())?.textContent, value).to.equal('Enter an ISO-8601 duration such as PT10S, or several separated by commas');
    }
    for (const value of [ 'PT0S', 'P1W2D', 'P1DT1H1M1S', 'PT10S, PT1M' ]) {
      changeInput(backoff(), value);
      await act(() => {});
      expect(errorOf(backoff()), value).not.to.exist;
    }

    expect(listenersIn(await elementXml('ServiceTask_BackoffExpression'))).to.eql([
      { eventType: 'start', retryBackoff: 'PT10S, PT1M', type: 'audit' },
    ]);
    expect(domQuery('.bio-properties-panel-list-badge--error', group()), 'badge once corrected').not.to.exist;
  }));

  it('should take the retry backoff out of the model when its field is emptied, and keep the field', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'ServiceTask_BackoffExpression');

    changeInput(input('ServiceTask_BackoffExpression', 'retryBackoff'), '');
    await act(() => {});

    expect(listenersIn(await elementXml('ServiceTask_BackoffExpression'))).to.eql([ { eventType: 'start', type: 'audit' } ]);
    expect(input('ServiceTask_BackoffExpression', 'retryBackoff'), 'the field, for a backoff to be entered again').to.exist;
    expect(errorOf(input('ServiceTask_BackoffExpression', 'retryBackoff')), 'an empty backoff is the engine default').not.to.exist;
  }));

  it('should undo and redo creating a listener', inject(async function(elementRegistry, selection, commandStack) {
    const event = await select(elementRegistry, selection, 'StartEvent_Plain');

    await add();
    expect(getListeners(event)).to.have.length(1);

    await act(() => commandStack.undo());
    expect(event.businessObject.extensionElements, 'extension elements after undo').to.be.undefined;
    expect(items()).to.have.length(0);

    await act(() => commandStack.redo());
    expect(getListeners(event)[0].eventType).to.equal('end');
  }));
});

describe('provider/zenbpm - execution listeners, with the input debounce of a host', function() {
  let container: HTMLElement;

  beforeEach(function() {
    container = TestContainer.get(this);
  });

  beforeEach(bootstrapZenBpmPropertiesPanel(diagramXML, { debounceInput: true }));

  it('should keep the field in view, with the focus, once the value typed so far corrects the last flagged one', inject(async function(elementRegistry, selection) {
    await act(() => selection.select(elementRegistry.get('ServiceTask_BackoffExpression')));
    const group = findGroup(container, GROUP);
    await act(() => (domQuery('.bio-properties-panel-collapsible-entry-header', group) as HTMLElement).click());
    const backoff = domQuery(`[name="${entryId('ServiceTask_BackoffExpression', 0, 'retryBackoff')}"]`, container) as HTMLInputElement;

    await act(() => backoff.focus());
    changeInput(backoff, 'PT1S');
    // the panel takes the value once the user has paused; the user types on afterwards
    await act(() => new Promise((resolve) => setTimeout(resolve, 800)));
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));

    expect(elementRegistry.get('ServiceTask_BackoffExpression').businessObject.extensionElements.values[0].listeners[0].get('retryBackoff')).to.equal('PT1S');
    expect(domQuery('.bio-properties-panel-list.open', group), 'the group').to.exist;
    expect(backoff.getClientRects().length > 0, 'the field in view').to.be.true;
    expect(document.activeElement, 'the focus').to.equal(backoff);
  }));
});

describe('provider/zenbpm - execution listeners, translated', function() {
  let container: HTMLElement;

  // Marks every translated text, so that a test can tell it from an untranslated one.
  function markingTranslate(template: string, replacements: Record<string, any> = {}) {
    return `[${template.replace(/{([^}]+)}/g, (_, key) => replacements[key] ?? `{${key}}`)}]`;
  }

  beforeEach(function() {
    container = TestContainer.get(this);
  });

  beforeEach(bootstrapZenBpmPropertiesPanel(diagramXML, {
    additionalModules: [ { translate: [ 'value', markingTranslate ] } ],
  }));

  function errorOf(name: string) {
    const field = domQuery(`[name="${name}"]`, container) as HTMLElement;
    return domQuery('.bio-properties-panel-error', field.closest('.bio-properties-panel-entry') as HTMLElement)?.textContent;
  }

  it('should translate the validation messages of a listener', inject(async function(elementRegistry, selection) {
    await act(() => selection.select(elementRegistry.get('StartEvent_Listener')));

    changeInput(domQuery(`[name="${entryId('StartEvent_Listener', 0, 'type')}"]`, container), '=jobType');
    changeInput(domQuery(`[name="${entryId('StartEvent_Listener', 0, 'retries')}"]`, container), '-1');
    await act(() => {});

    expect(errorOf(entryId('StartEvent_Listener', 0, 'type'))).to.equal('[Enter the job type as a literal: a listener takes no FEEL expression]');
    expect(errorOf(entryId('StartEvent_Listener', 0, 'retries'))).to.equal('[Enter a whole number from 0 to 2147483647]');

    await act(() => selection.select(elementRegistry.get('StartEvent_SubProcessListener')));
    expect(errorOf(entryId('StartEvent_SubProcessListener', 0, 'eventType'))).to.match(/^\[Remove this listener/);

    await act(() => selection.select(elementRegistry.get('ServiceTask_Duplicate')));
    expect(errorOf(entryId('ServiceTask_Duplicate', 0, 'type'))).to.equal('[Enter another job type: two listeners of one event type need different types]');
  }));

  it('should translate the name of the group and of each listener', inject(async function(elementRegistry, selection) {
    await act(() => selection.select(elementRegistry.get('ServiceTask_Chain')));

    const group = findGroup(container, GROUP);
    expect(domQuery('.bio-properties-panel-group-header-title', group)?.textContent).to.equal('[Execution listeners]');
    expect(domQuery('.bio-properties-panel-collapsible-entry-header-title', group)?.textContent).to.equal('[[Start]: reserve-stock]');
  }));
});

describe('provider/zenbpm - execution listeners, in a collaboration', function() {
  let container: HTMLElement;

  beforeEach(function() {
    container = TestContainer.get(this);
  });

  beforeEach(bootstrapZenBpmPropertiesPanel(collaborationXML));

  function group() {
    return findGroup(container, GROUP);
  }

  it('should show a listener on the process of a pool as one the engine ignores, so that it can be removed', inject(async function(elementRegistry, selection) {
    const pool = elementRegistry.get('Participant_Listener');
    await act(() => selection.select(pool));

    expect(group(), 'execution listeners group').to.exist;
    expect(domQuery('.bio-properties-panel-add-entry', group()), 'no listener is offered there').not.to.exist;
    const eventType = (domQuery(`[name="${entryId('Participant_Listener', 0, 'eventType')}"]`, container) as HTMLElement)
      .closest('.bio-properties-panel-entry') as HTMLElement;
    expect(domQuery('.bio-properties-panel-description', eventType)?.textContent).to.equal(
      'The engine runs no listener on the process itself and ignores this one. It can be removed.'
    );
    expect(domQuery('.bio-properties-panel-error', eventType), 'the engine deploys the model').not.to.exist;

    await act(() => (domQuery('.bio-properties-panel-remove-entry', group()) as HTMLButtonElement).click());

    expect(pool.businessObject.processRef.extensionElements, 'extension elements of the process').to.be.undefined;
    expect(group(), 'execution listeners group').not.to.exist;
    const { xml } = await getBpmnJS().saveXML({ format: true });
    expect(xml).not.to.contain('executionListener');
  }));

  it('should offer no listener on the pool of a process without one, and one on a start event in a pool', inject(async function(elementRegistry, selection) {
    await act(() => selection.select(elementRegistry.get('Participant_Plain')));
    expect(group(), 'execution listeners group of the pool').not.to.exist;

    await act(() => selection.select(elementRegistry.get('StartEvent_InPool')));
    expect(domQuery('.bio-properties-panel-add-entry', group()), 'create button of the start event').to.exist;
  }));
});
