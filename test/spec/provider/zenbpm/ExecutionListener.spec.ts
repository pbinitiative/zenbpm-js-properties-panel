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

function entryId(elementId: string, index: number, field: string) {
  return `${elementId}-zenbpm-executionListener-${index}-${field}`;
}

describe('provider/zenbpm - execution listener', function() {
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

  function input(elementId: string, field: string, index = 0) {
    return domQuery(`[name="${entryId(elementId, index, field)}"]`, container) as HTMLInputElement | HTMLSelectElement;
  }

  function errorOf(field: HTMLElement) {
    return domQuery('.bio-properties-panel-error', field.closest('.bio-properties-panel-entry') as HTMLElement);
  }

  async function add() {
    await act(() => addButton()!.click());
  }

  async function startEventXml(id: string) {
    const { xml } = await getBpmnJS().saveXML({ format: true });
    return xml.match(new RegExp(`<bpmn:startEvent id="${id}"[\\s\\S]*?</bpmn:startEvent>`))?.[0];
  }

  // The attributes of the only listener in the XML, whatever their order.
  function attributesOf(startEventXml: string | undefined) {
    const tag = startEventXml?.match(/<zenbpm:executionListener ([^>]*)\/>/)?.[1] ?? '';
    return Object.fromEntries([ ...tag.matchAll(/(\w+)="([^"]*)"/g) ].map(([ , name, value ]) => [ name, value ]));
  }

  it('should offer to create a listener on a start event directly under the process', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'StartEvent_Plain');

    expect(group(), 'execution listener group').to.exist;
    expect(addButton(), 'create button').to.exist;
    expect(items(), 'no listener yet').to.have.length(0);
  }));

  for (const id of [ 'StartEvent_SubProcess', 'StartEvent_EventSubProcess', 'ServiceTask_1', 'EndEvent_1', 'SubProcess_1' ]) {
    it(`should offer no listener on ${id}, which the engine refuses at deployment`, inject(async function(elementRegistry, selection) {
      await select(elementRegistry, selection, id);

      expect(group(), 'execution listener group').not.to.exist;
    }));
  }

  it('should show the event type, type and retries of an existing listener, and offer no second one', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'StartEvent_Listener');

    expect(items()).to.have.length(1);
    expect(input('StartEvent_Listener', 'eventType').value).to.equal('end');
    expect(input('StartEvent_Listener', 'type').value).to.equal('order-started');
    expect(input('StartEvent_Listener', 'retries').value).to.equal('3');
    expect(addButton(), 'the engine runs one listener on a start event').not.to.exist;
  }));

  it('should create an end listener, take the type entered and persist it in the XML', inject(async function(elementRegistry, selection) {
    const event = await select(elementRegistry, selection, 'StartEvent_Plain');

    await add();
    expect(getListeners(event), 'listeners').to.have.length(1);
    expect(getListeners(event)[0].eventType).to.equal('end');
    expect(errorOf(input('StartEvent_Plain', 'type'))?.textContent, 'a type is still missing').to.match(/Enter the job type/);

    changeInput(input('StartEvent_Plain', 'type'), 'order-started');
    changeInput(input('StartEvent_Plain', 'retries'), '5');

    expect(getListeners(event)[0].type).to.equal('order-started');
    expect(getListeners(event)[0].retries).to.equal('5');
    expect(await startEventXml('StartEvent_Plain')).to.match(
      /<bpmn:extensionElements>\s*<zenbpm:executionListeners>\s*<zenbpm:executionListener [^>]*\/>\s*<\/zenbpm:executionListeners>/
    );
    expect(attributesOf(await startEventXml('StartEvent_Plain'))).to.eql({ eventType: 'end', retries: '5', type: 'order-started' });

    changeInput(input('StartEvent_Plain', 'retries'), '');
    expect(getListeners(event)[0].retries, 'empty retries are left out').to.be.undefined;
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

    expect(attributesOf(await startEventXml('StartEvent_Backoff'))).to.eql({
      eventType: 'end', retries: '5', retryBackoff: 'PT10S', type: 'order-received',
    });
  }));

  it('should remove the listener with its delete button and keep the other extensions', inject(async function(elementRegistry, selection) {
    const event = await select(elementRegistry, selection, 'StartEvent_Listener');

    await act(() => (domQuery('.bio-properties-panel-remove-entry', group()) as HTMLButtonElement).click());

    expect(getListeners(event), 'listeners').to.be.undefined;
    expect(addButton(), 'a listener can be created again').to.exist;
    const startEvent = await startEventXml('StartEvent_Listener');
    expect(startEvent, 'start event in the XML').to.exist;
    expect(startEvent).not.to.contain('executionListener');
    expect(startEvent).to.contain('<zenbpm:output source="=orderId" target="orderId" />');
  }));

  it('should leave no empty extension elements behind when the last extension is removed', inject(async function(elementRegistry, selection) {
    const event = await select(elementRegistry, selection, 'StartEvent_OnlyListener');

    await act(() => (domQuery('.bio-properties-panel-remove-entry', group()) as HTMLButtonElement).click());

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

  it('should show a listener of another event type with the reason, and set it to End', inject(async function(elementRegistry, selection) {
    const event = await select(elementRegistry, selection, 'StartEvent_StartListener');

    const eventType = input('StartEvent_StartListener', 'eventType') as HTMLSelectElement;
    expect(eventType.value).to.equal('start');
    expect(errorOf(eventType)?.textContent).to.match(/only an end listener/);

    await act(() => fireEvent.change(eventType, { target: { value: 'end' } }));

    expect(getListeners(event)[0].eventType).to.equal('end');
    expect(errorOf(input('StartEvent_StartListener', 'eventType')), 'no error once End').not.to.exist;
  }));

  it('should show every listener of a start event with more than one, and remove one of them', inject(async function(elementRegistry, selection) {
    const event = await select(elementRegistry, selection, 'StartEvent_TwoListeners');

    expect(items()).to.have.length(2);
    for (const index of [ 0, 1 ]) {
      expect(errorOf(input('StartEvent_TwoListeners', 'eventType', index))?.textContent, `listener ${index}`).to.match(/one listener/);
    }

    await act(() => (domQueryAll('.bio-properties-panel-remove-entry', group())[1] as HTMLButtonElement).click());

    expect(getListeners(event).map((listener: any) => listener.type)).to.eql([ 'first' ]);
    expect(errorOf(input('StartEvent_TwoListeners', 'eventType')), 'no error with one listener').not.to.exist;
  }));

  it('should show a listener inside a sub-process with the reason, so that it can be removed', inject(async function(elementRegistry, selection) {
    const event = await select(elementRegistry, selection, 'StartEvent_SubProcessListener');

    expect(group(), 'execution listener group').to.exist;
    expect(addButton(), 'no listener is offered there').not.to.exist;
    expect(errorOf(input('StartEvent_SubProcessListener', 'eventType'))?.textContent).to.match(/directly under the process/);

    await act(() => (domQuery('.bio-properties-panel-remove-entry', group()) as HTMLButtonElement).click());

    expect(event.businessObject.extensionElements, 'extension elements').to.be.undefined;
    expect(group(), 'execution listener group').not.to.exist;
  }));

  it('should flag a listener moved into a sub-process', inject(async function(elementRegistry, selection, modeling) {
    const event = elementRegistry.get('StartEvent_Listener');
    const subProcess = elementRegistry.get('SubProcess_1');

    await act(() => modeling.moveElements([ event ], { x: -40, y: 180 }, subProcess));
    await select(elementRegistry, selection, 'StartEvent_Listener');

    expect(event.businessObject.$parent.id).to.equal('SubProcess_1');
    expect(errorOf(input('StartEvent_Listener', 'eventType'))?.textContent).to.match(/directly under the process/);
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

describe('provider/zenbpm - execution listener, translated', function() {
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
  }));
});
