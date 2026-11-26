import { expect } from 'chai';
import TestContainer from 'mocha-test-container-support';

import { act, fireEvent, render } from '@testing-library/preact';
import { query as domQuery, queryAll as domQueryAll } from 'min-dom';

import {
  bootstrapZenBpmPropertiesPanel,
  changeInput,
  clickInput,
  findGroup,
  getBpmnJS,
  inject,
  setEditorValue,
} from 'test/TestHelper';

import {
  getTimerDefinitionType,
  getTimerEventDefinition,
  getTimerValueTooltip,
  isProcessStartEvent,
} from 'lib/provider/zenbpm/parts/TimerProps';

import diagramXML from './fixtures/Timer.bpmn';

const TIMER_GROUP = 'timer';
const TYPE_ENTRY = 'timerEventDefinitionType';
const VALUE_ENTRY = 'timerEventDefinitionValue';


describe('provider/zenbpm - timer event definition', function() {
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

  function typeSelect() {
    return domQuery(`[data-entry-id="${TYPE_ENTRY}"] select`, container) as HTMLSelectElement;
  }

  function valueEntry() {
    return domQuery(`[data-entry-id="${VALUE_ENTRY}"]`, container) as HTMLElement;
  }

  function staticInput() {
    return domQuery(`input[name="${VALUE_ENTRY}"]`, container) as HTMLInputElement;
  }

  function feelEditor() {
    return domQuery(`[data-entry-id="${VALUE_ENTRY}"] [role="textbox"]`, container) as HTMLElement;
  }

  function feelToggle() {
    return domQuery(`[data-entry-id="${VALUE_ENTRY}"] .bio-properties-panel-feel-icon`, container) as HTMLButtonElement;
  }

  // the body of the timer value, the `=` of an expression included
  function timerValue(element: any, type: string) {
    return getTimerEventDefinition(element).get(type)?.get('body');
  }

  async function saveXML() {
    const { xml } = await getBpmnJS().saveXML({ format: true });
    return xml as string;
  }


  describe('group', function() {

    for (const id of [
      'TimerStart_Process',
      'TimerCatch_Literal',
      'TimerCatch_Expression',
      'TimerBoundary_Interrupting',
      'TimerBoundary_NonInterrupting',
      'TimerStart_EventSubProcess',
    ]) {
      it(`should offer every timer type and a static or FEEL value on ${id}`, inject(async function(elementRegistry, selection) {
        await select(elementRegistry, selection, id);

        expect(findGroup(container, TIMER_GROUP), 'timer group').to.exist;
        expect(domQueryAll(`[data-entry-id="${TYPE_ENTRY}"]`, container), 'type entries').to.have.length(1);
        expect(domQueryAll(`[data-entry-id="${VALUE_ENTRY}"]`, container), 'value entries').to.have.length(1);

        const options = Array.from(typeSelect().options).map((option) => `${option.value}:${option.label}`);
        expect(options).to.eql([ ':<none>', 'timeDate:Date', 'timeDuration:Duration', 'timeCycle:Cycle' ]);

        const toggle = feelToggle();
        expect(toggle, 'FEEL toggle').to.exist;
        expect(toggle.disabled, 'FEEL is optional').to.be.false;
      }));
    }


    it('should offer only the type while none is chosen', inject(async function(elementRegistry, selection) {
      await select(elementRegistry, selection, 'TimerCatch_Empty');

      expect(findGroup(container, TIMER_GROUP), 'timer group').to.exist;
      expect(typeSelect().value).to.equal('');
      expect(valueEntry(), 'value entry').not.to.exist;
    }));


    for (const id of [ 'MessageCatch_1', 'UserTask_1' ]) {
      it(`should not show for ${id}`, inject(async function(elementRegistry, selection) {
        await select(elementRegistry, selection, id);

        expect(findGroup(container, TIMER_GROUP), 'timer group').not.to.exist;
      }));
    }

  });


  describe('static value', function() {

    it('should display a literal in a plain input', inject(async function(elementRegistry, selection) {
      await select(elementRegistry, selection, 'TimerCatch_Literal');

      expect(typeSelect().value).to.equal('timeDuration');
      expect(staticInput(), 'plain input').to.exist;
      expect(staticInput().value).to.equal('PT15M');
      expect(feelEditor(), 'FEEL editor').not.to.exist;
    }));


    it('should keep a literal a literal on update', inject(async function(elementRegistry, selection) {
      const event = await select(elementRegistry, selection, 'TimerCatch_Literal');

      changeInput(staticInput(), 'P14D');

      expect(timerValue(event, 'timeDuration')).to.equal('P14D');
      expect(await saveXML()).to.contain('<bpmn:timeDuration xsi:type="bpmn:tFormalExpression">P14D</bpmn:timeDuration>');
    }));


    it('should keep the type when the value is cleared', inject(async function(elementRegistry, selection) {
      const event = await select(elementRegistry, selection, 'TimerCatch_Literal');

      changeInput(staticInput(), '');

      expect(timerValue(event, 'timeDuration')).not.to.exist;
      expect(getTimerDefinitionType(getTimerEventDefinition(event))).to.equal('timeDuration');
      expect(typeSelect().value).to.equal('timeDuration');
      expect(valueEntry(), 'value entry').to.exist;
    }));


    it('should display a cron cycle of a process start event', inject(async function(elementRegistry, selection) {
      await select(elementRegistry, selection, 'TimerStart_Process');

      expect(typeSelect().value).to.equal('timeCycle');
      expect(staticInput().value).to.equal('0 2 * * *');
    }));

  });


  describe('FEEL expression', function() {

    it('should display an expression in the FEEL editor', inject(async function(elementRegistry, selection) {
      await select(elementRegistry, selection, 'TimerCatch_Expression');

      expect(typeSelect().value).to.equal('timeDate');
      expect(feelEditor(), 'FEEL editor').to.exist;
      expect(feelEditor().textContent).to.equal('dueAt');
      expect(domQuery('.bio-properties-panel-feel-editor-container', valueEntry())).to.exist;
      expect(staticInput(), 'plain input').not.to.exist;
    }));


    it('should keep the = of an expression on update', inject(async function(elementRegistry, selection) {
      const event = await select(elementRegistry, selection, 'TimerCatch_Expression');

      await setEditorValue(feelEditor(), 'date and time(sentAt) + duration("P3D")');

      expect(timerValue(event, 'timeDate')).to.equal('=date and time(sentAt) + duration("P3D")');
      expect(await saveXML()).to.contain(
        '<bpmn:timeDate xsi:type="bpmn:tFormalExpression">=date and time(sentAt) + duration("P3D")</bpmn:timeDate>'
      );
    }));


    it('should escape an expression in the XML and read it back', inject(async function(elementRegistry, selection) {
      const event = await select(elementRegistry, selection, 'TimerCatch_Expression');

      await setEditorValue(feelEditor(), 'if priority < 5 then early else late');

      expect(timerValue(event, 'timeDate')).to.equal('=if priority < 5 then early else late');
      expect(await saveXML()).to.contain(
        '<bpmn:timeDate xsi:type="bpmn:tFormalExpression">=if priority &lt; 5 then early else late</bpmn:timeDate>'
      );
    }));


    for (const [ id, type, expression ] of [
      [ 'TimerBoundary_Interrupting', 'timeDuration', 'waitFor' ],
      [ 'TimerBoundary_NonInterrupting', 'timeCycle', 'reminderCycle' ],
    ]) {
      it(`should display the expression of ${id}`, inject(async function(elementRegistry, selection) {
        await select(elementRegistry, selection, id);

        expect(typeSelect().value).to.equal(type);
        expect(feelEditor().textContent).to.equal(expression);
      }));
    }


    it('should turn a static value into an expression with the FEEL toggle', inject(async function(elementRegistry, selection) {
      const event = await select(elementRegistry, selection, 'TimerCatch_Literal');

      await act(() => {
        clickInput(feelToggle());
      });

      expect(timerValue(event, 'timeDuration')).to.equal('=PT15M');
      expect(feelEditor(), 'FEEL editor').to.exist;
      expect(staticInput(), 'plain input').not.to.exist;
    }));


    it('should turn an expression into a static value with the FEEL toggle', inject(async function(elementRegistry, selection) {
      const event = await select(elementRegistry, selection, 'TimerCatch_Expression');

      await act(() => {
        clickInput(feelToggle());
      });

      expect(timerValue(event, 'timeDate')).to.equal('dueAt');
      expect(staticInput(), 'plain input').to.exist;
      expect(staticInput().value).to.equal('dueAt');
      expect(feelEditor(), 'FEEL editor').not.to.exist;
    }));


    it('should become an expression when = is typed into the static input', inject(async function(elementRegistry, selection) {
      const event = await select(elementRegistry, selection, 'TimerCatch_Literal');

      changeInput(staticInput(), '=waitFor');
      await act(() => {});

      expect(timerValue(event, 'timeDuration')).to.equal('=waitFor');
      expect(feelEditor(), 'FEEL editor').to.exist;
    }));

  });


  describe('type', function() {

    it('should start a chosen type with an empty value', inject(async function(elementRegistry, selection) {
      const event = await select(elementRegistry, selection, 'TimerCatch_Empty');

      await act(() => fireEvent.change(typeSelect(), { target: { value: 'timeDate' } }));

      const timerEventDefinition = getTimerEventDefinition(event);
      expect(getTimerDefinitionType(timerEventDefinition)).to.equal('timeDate');
      expect(timerEventDefinition.get('timeDate').$type).to.equal('bpmn:FormalExpression');
      expect(timerValue(event, 'timeDate')).not.to.exist;
      expect(valueEntry(), 'value entry').to.exist;
      expect(staticInput().value).to.equal('');

      changeInput(staticInput(), '=dueAt');
      expect(timerValue(event, 'timeDate')).to.equal('=dueAt');
      expect(await saveXML()).to.contain('<bpmn:timeDate xsi:type="bpmn:tFormalExpression">=dueAt</bpmn:timeDate>');
    }));


    it('should replace the value of the former type', inject(async function(elementRegistry, selection) {
      const event = await select(elementRegistry, selection, 'TimerCatch_Expression');

      await act(() => fireEvent.change(typeSelect(), { target: { value: 'timeCycle' } }));

      const timerEventDefinition = getTimerEventDefinition(event);
      expect(timerEventDefinition.get('timeDate')).not.to.exist;
      expect(timerEventDefinition.get('timeDuration')).not.to.exist;
      expect(getTimerDefinitionType(timerEventDefinition)).to.equal('timeCycle');
      expect(timerValue(event, 'timeCycle')).not.to.exist;

      const xml = await saveXML();
      expect(xml).not.to.contain('=dueAt');
    }));


    it('should remove the value with <none>', inject(async function(elementRegistry, selection) {
      const event = await select(elementRegistry, selection, 'TimerCatch_Literal');

      await act(() => fireEvent.change(typeSelect(), { target: { value: '' } }));

      expect(getTimerDefinitionType(getTimerEventDefinition(event))).not.to.exist;
      expect(valueEntry(), 'value entry').not.to.exist;
      expect(await saveXML()).not.to.contain('PT15M');
    }));

  });


  describe('tooltip', function() {

    function tooltipText(type: string, processStart = false) {
      const { container: tooltip } = render(getTimerValueTooltip(type, (text: string) => text, processStart));
      return tooltip.textContent as string;
    }

    it('should tell the start event of a process from the other timer events', inject(function(elementRegistry) {
      expect(isProcessStartEvent(elementRegistry.get('TimerStart_Process'))).to.be.true;

      for (const id of [
        'TimerStart_EventSubProcess',
        'TimerCatch_Literal',
        'TimerBoundary_Interrupting',
        'UserTask_1',
      ]) {
        expect(isProcessStartEvent(elementRegistry.get(id)), id).to.be.false;
      }
    }));


    it('should offer expressions over process variables where an instance exists', function() {
      expect(tooltipText('timeDate')).to.contain('=dueAt').and.to.contain('The value is evaluated when the timer is created.');
      expect(tooltipText('timeDuration')).to.contain('=reminderAfter').and.to.contain('at once if it has passed');
      expect(tooltipText('timeCycle')).to.contain('=reminderCycle').and.to.contain('evaluated once');
    });


    it('should say that the start event of a process has no variables', function() {
      for (const type of [ 'timeDate', 'timeCycle' ]) {
        const text = tooltipText(type, true);

        expect(text, type).to.contain('The start event of a process has no variables');
        expect(text, type).not.to.contain('process variable holds');
      }
      expect(tooltipText('timeDate', true)).to.contain('=now() + duration("PT1H")');
    });


    it('should say that the start event of a process takes no duration', function() {
      const text = tooltipText('timeDuration', true);

      expect(text).to.contain('The engine takes no duration on the start event of a process');
      expect(text).not.to.contain('=reminderAfter');
    });


    it('should name the time zone a cron expression is read in', function() {
      for (const processStart of [ false, true ]) {
        const text = tooltipText('timeCycle', processStart);

        expect(text).to.contain('in the time zone of the engine');
        expect(text).not.to.contain('UTC');
      }
    });

  });


  describe('undo and redo', function() {

    it('should undo and redo a value change', inject(async function(elementRegistry, selection, commandStack) {
      const event = await select(elementRegistry, selection, 'TimerCatch_Expression');

      await setEditorValue(feelEditor(), 'payoutDeadline');
      expect(timerValue(event, 'timeDate')).to.equal('=payoutDeadline');

      await act(() => commandStack.undo());
      expect(timerValue(event, 'timeDate')).to.equal('=dueAt');

      await act(() => commandStack.redo());
      expect(timerValue(event, 'timeDate')).to.equal('=payoutDeadline');
    }));


    it('should undo a type change', inject(async function(elementRegistry, selection, commandStack) {
      const event = await select(elementRegistry, selection, 'TimerCatch_Expression');

      await act(() => fireEvent.change(typeSelect(), { target: { value: 'timeDuration' } }));
      expect(getTimerDefinitionType(getTimerEventDefinition(event))).to.equal('timeDuration');

      await act(() => commandStack.undo());
      expect(getTimerDefinitionType(getTimerEventDefinition(event))).to.equal('timeDate');
      expect(timerValue(event, 'timeDate')).to.equal('=dueAt');
    }));

  });

});
