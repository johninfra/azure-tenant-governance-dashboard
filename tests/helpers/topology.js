import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

// CSS is a Vite import, so load the unchanged topology renderer in a JS-only context.
const source = (await readFile(new URL('../../src/topology.js', import.meta.url), 'utf8'))
  .replace("import './topology.css';", '').replace('export function renderTopology', 'function renderTopology');
const context = vm.createContext({});
new vm.Script(source).runInContext(context);
export const renderTopology = vm.runInContext('renderTopology', context);
