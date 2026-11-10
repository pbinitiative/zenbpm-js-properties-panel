import { expect } from 'chai';
import TestContainer from 'mocha-test-container-support';

import { act } from '@testing-library/preact';
import { query as domQuery } from 'min-dom';

import {
  bootstrapZenBpmPropertiesPanel,
  changeInput,
  findGroup,
  getBpmnJS,
  inject,
} from 'test/TestHelper';

import diagramXML from './fixtures/ExecutionListener.bpmn';

const GROUP = 'zenbpm-executionListener';
const TYPE_INPUT = 'input[name="zenbpm-executionListener-type"]';
const RETRIES_INPUT = 'input[name="zenbpm-executionListener-retries"]';

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

  function typeInput() {
    return domQuery(TYPE_INPUT, container) as HTMLInputElement;
  }

  function retriesInput() {
    return domQuery(RETRIES_INPUT, container) as HTMLInputElement | null;
  }

  function errorOf(input: HTMLElement) {
    return domQuery('.bio-properties-panel-error', input.closest('.bio-properties-panel-entry') as HTMLElement);
  }

  it('should offer a listener on a start event directly under the process, Type first', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'StartEvent_Plain');

    expect(findGroup(container, GROUP), 'execution listener group').to.exist;
    expect(typeInput(), 'type entry').to.exist;
    expect(retriesInput(), 'no retries before a listener exists').not.to.exist;
  }));

  for (const id of [ 'StartEvent_SubProcess', 'StartEvent_EventSubProcess', 'ServiceTask_1', 'EndEvent_1', 'SubProcess_1' ]) {
    it(`should offer no listener on ${id}, which the engine refuses at deployment`, inject(async function(elementRegistry, selection) {
      await select(elementRegistry, selection, id);

      expect(findGroup(container, GROUP), 'execution listener group').not.to.exist;
    }));
  }

  it('should show the type and retries of an existing listener', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'StartEvent_Listener');

    expect(typeInput().value).to.equal('order-started');
    expect(retriesInput()?.value).to.equal('3');
  }));

  it('should create an end listener with the type entered and persist it in the XML', inject(async function(elementRegistry, selection) {
    const event = await select(elementRegistry, selection, 'StartEvent_Plain');

    changeInput(typeInput(), 'order-started');

    const listeners = getListeners(event);
    expect(listeners, 'listeners').to.have.length(1);
    expect(listeners[0].eventType).to.equal('end');
    expect(listeners[0].type).to.equal('order-started');

    const { xml } = await getBpmnJS().saveXML({ format: true });
    expect(xml).to.match(
      /<bpmn:startEvent id="StartEvent_Plain"[^>]*>\s*<bpmn:extensionElements>\s*<zenbpm:executionListeners>\s*<zenbpm:executionListener eventType="end" type="order-started" \/>\s*<\/zenbpm:executionListeners>/
    );
  }));

  it('should offer the retries once a listener exists and persist them', inject(async function(elementRegistry, selection) {
    const event = await select(elementRegistry, selection, 'StartEvent_Plain');

    changeInput(typeInput(), 'order-started');
    await act(() => {});
    const retries = retriesInput();
    expect(retries, 'retries entry').to.exist;

    changeInput(retries, '5');
    expect(getListeners(event)[0].retries).to.equal('5');

    changeInput(retries, '');
    expect(getListeners(event)[0].retries, 'empty retries are left out').to.be.undefined;
  }));

  it('should update the type of an existing listener in place', inject(async function(elementRegistry, selection) {
    const event = await select(elementRegistry, selection, 'StartEvent_Listener');

    changeInput(typeInput(), 'order-received');

    const listeners = getListeners(event);
    expect(listeners, 'listeners').to.have.length(1);
    expect(listeners[0].type).to.equal('order-received');
    expect(listeners[0].retries).to.equal('3');
  }));

  it('should remove the listener and keep the other extensions when the type is cleared', inject(async function(elementRegistry, selection) {
    const event = await select(elementRegistry, selection, 'StartEvent_Listener');

    changeInput(typeInput(), '');

    expect(getListeners(event), 'listeners').to.be.undefined;
    const { xml } = await getBpmnJS().saveXML({ format: true });
    const startEvent = xml.match(/<bpmn:startEvent id="StartEvent_Listener"[\s\S]*?<\/bpmn:startEvent>/)?.[0];
    expect(startEvent, 'start event in the XML').to.exist;
    expect(startEvent).not.to.contain('executionListener');
    expect(startEvent).to.contain('<zenbpm:output source="=orderId" target="orderId" />');
  }));

  it('should leave no empty extension elements behind when the last extension is removed', inject(async function(elementRegistry, selection) {
    const event = await select(elementRegistry, selection, 'StartEvent_OnlyListener');

    changeInput(typeInput(), '   ');

    expect(event.businessObject.extensionElements, 'extension elements').to.be.undefined;
  }));

  it('should explain that a listener takes no FEEL expression', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'StartEvent_Listener');

    changeInput(typeInput(), '=jobType');
    await act(() => {});
    expect(errorOf(typeInput())?.textContent).to.match(/literal/);

    changeInput(retriesInput(), '=retries');
    await act(() => {});
    expect(errorOf(retriesInput()!)?.textContent).to.match(/literal/);
  }));

  it('should refuse retries the engine does not read', inject(async function(elementRegistry, selection) {
    await select(elementRegistry, selection, 'StartEvent_Listener');

    for (const value of [ '-1', '1.5', 'three', '2147483648' ]) {
      changeInput(retriesInput(), value);
      await act(() => {});
      expect(errorOf(retriesInput()!)?.textContent, value).to.match(/whole number/);
    }

    changeInput(retriesInput(), '2147483647');
    await act(() => {});
    expect(errorOf(retriesInput()!), 'the int32 maximum is fine').not.to.exist;
  }));

  it('should undo and redo creating a listener', inject(async function(elementRegistry, selection, commandStack) {
    const event = await select(elementRegistry, selection, 'StartEvent_Plain');

    changeInput(typeInput(), 'order-started');
    expect(getListeners(event)).to.have.length(1);

    await act(() => commandStack.undo());
    expect(event.businessObject.extensionElements, 'extension elements after undo').to.be.undefined;
    expect(typeInput().value).to.equal('');

    await act(() => commandStack.redo());
    expect(getListeners(event)[0].type).to.equal('order-started');
  }));
});
