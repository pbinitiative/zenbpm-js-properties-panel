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

  function getListeners(element: any) {
    const listeners = (element.businessObject.extensionElements?.values || []).find(
      (value: any) => value.$type === 'zenbpm:ExecutionListeners'
    );
    return listeners?.listeners;
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

  it('should add no undo step when an empty Retries field is left untouched', inject(async function(elementRegistry, selection, commandStack) {
    await select(elementRegistry, selection, 'StartEvent_OnlyListener');

    const retries = input('StartEvent_OnlyListener', 'retries');
    await act(() => {
      fireEvent.focus(retries);
      fireEvent.blur(retries);
    });

    expect(commandStack.canUndo(), 'undo step').to.be.false;
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

  it('should flag a listener on an element without an outgoing sequence flow, until one is connected', inject(async function(elementRegistry, selection, modeling) {
    const task = await select(elementRegistry, selection, 'ServiceTask_NoOutgoing');

    expect(errorOf(input('ServiceTask_NoOutgoing', 'eventType'))?.textContent).to.match(/^Connect an outgoing sequence flow/);

    // drawing a flow moves the selection on, and the panel reads the element anew when it is selected again
    await act(() => modeling.connect(task, elementRegistry.get('EndEvent_1')));
    await select(elementRegistry, selection, 'EndEvent_1');
    await select(elementRegistry, selection, 'ServiceTask_NoOutgoing');

    expect(errorOf(input('ServiceTask_NoOutgoing', 'eventType')), 'no error once connected').not.to.exist;
  }));

  it('should show a listener on a multi-instance activity with the reason, and offer no further one', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'ServiceTask_MultiInstance');

    expect(addButton(), 'no listener is offered there').not.to.exist;
    expect(optionsOf(input('ServiceTask_MultiInstance', 'eventType')), 'only the value of the model').to.eql([ 'start' ]);
    expect(errorOf(input('ServiceTask_MultiInstance', 'eventType'))?.textContent).to.match(/no listener on a multi-instance activity/);
  }));

  it('should show a listener on a business rule task which calls a decision with the reason, and accept it once a job worker does the task', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'BusinessRuleTask_DmnListener');

    expect(addButton(), 'no listener is offered there').not.to.exist;
    expect(errorOf(input('BusinessRuleTask_DmnListener', 'eventType'))?.textContent).to.match(/choose the Job worker implementation/);

    const implementation = domQuery('[name="zenbpm-implementation-type"]', container) as HTMLSelectElement;
    await act(() => fireEvent.change(implementation, { target: { value: 'jobWorker' } }));

    expect(errorOf(input('BusinessRuleTask_DmnListener', 'eventType')), 'no error once a job worker does the task').not.to.exist;
    expect(addButton(), 'a further listener is offered').to.exist;
  }));

  it('should show a listener on the process with the reason, so that it can be removed', inject(async function(canvas, selection) {
    await act(() => selection.select([]));
    const process = canvas.getRootElement();

    expect(group(), 'execution listeners group').to.exist;
    expect(addButton(), 'no listener is offered there').not.to.exist;
    expect(errorOf(input('Process_1', 'eventType'))?.textContent).to.equal(
      'Remove this listener: the engine runs no listener on the process itself'
    );

    await removeItem();

    expect(process.businessObject.extensionElements, 'extension elements').to.be.undefined;
    expect(group(), 'execution listeners group').not.to.exist;
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
