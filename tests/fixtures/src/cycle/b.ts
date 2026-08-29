import { aFunction } from './a.js';

export function bFunction(): string {
  return "b";
}

export function callBackToA(): string {
  return aFunction();
}
