/**
 * The `bpmn:TimerEventDefinition` of the element, or `undefined` if it has
 * none.
 */
export declare function getTimerEventDefinition(element: any): any;
/**
 * Which of timeDate / timeCycle / timeDuration the timer event definition
 * carries, or `undefined` if none is set yet.
 */
export declare function getTimerDefinitionType(timerEventDefinition: any): string | undefined;
/**
 * Whether the element is the start event of a process itself, as opposed to
 * that of an event sub-process. The engine creates its timer when the process
 * is deployed, where no process instance and so no variables exist.
 */
export declare function isProcessStartEvent(element: any): boolean;
/**
 * What the value of a timer may be, with examples. The start event of a
 * process is told apart: its expression has no variables to read, and the
 * engine takes no duration there.
 */
export declare function getTimerValueTooltip(timerDefinitionType: string, translate: (text: string) => string, processStart?: boolean): any;
/**
 * Entries of the timer group: the type of the timer, and its value once a type
 * is chosen. Empty for an element without a timer event definition.
 */
export declare function TimerProps(element: any): any[];
