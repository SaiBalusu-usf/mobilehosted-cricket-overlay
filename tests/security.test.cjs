const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness(query) {
  const routes = new Map();
  const calls = [];
  const staticRoots = [];
  const app = { use() {}, get(route, handler) { routes.set(route, handler); }, listen() {} };
  const express = () => app;
  express.static = root => { staticRoots.push(root); return () => {}; };
  const res = { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  const mockProcess = { ...process, platform: 'win32' };
  const capture = method => (...args) => {
    calls.push({ method, args: args.slice(0, -1) });
    args.at(-1)(new Error('upstream failure'), '', 'private upstream diagnostics');
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8'), {
    require(name) {
      if (name === 'express') return express;
      if (name === 'cors') return () => () => {};
      if (name === 'cheerio') return {};
      if (name === 'child_process') return { exec: capture('exec'), execFile: capture('execFile') };
      return require(name);
    },
    __dirname: path.resolve(__dirname, '..'), process: mockProcess, URL,
    console: { log() {}, error() {} },
  });
  routes.get('/api/live-score')({ query }, res);
  return { calls, res, staticRoots, routes };
}

for (const query of [
  { league: 'TCL" & echo INJECTION' },
  { matchId: '$(echo INJECTION)' },
  { clubId: '1&extra=2' },
  { league: ['TCL', 'OTHER'] },
  { league: '../admin' },
]) test(`rejects unsafe query ${JSON.stringify(query)}`, () => {
  const { calls, res } = harness(query);
  assert.equal(res.code, 400);
  assert.equal(calls.length, 0);
});

test('valid request invokes a fixed executable with separate arguments and no redirect', () => {
  const { calls } = harness({ league: 'TCL', matchId: '5405', clubId: '157' });
  assert.equal(calls[0].method, 'execFile');
  const [program, args, options] = calls[0].args;
  assert.equal(program, 'curl.exe');
  assert.ok(Array.isArray(args));
  assert.ok(args.includes('https://cricclubs.com/TCL/viewScorecard.do?matchId=5405&clubId=157'));
  assert.ok(!args.includes('-L') && !args.includes('--location'));
  assert.notEqual(options.shell, true);
  assert.ok(options.timeout <= 20000);
});

test('does not expose command diagnostics in HTTP responses', () => {
  const { res } = harness({});
  assert.equal(res.code, 502);
  assert.ok(!JSON.stringify(res.body).includes('private upstream diagnostics'));
});

test('does not expose the repository root as a static directory', () => {
  const { staticRoots, routes } = harness({});
  assert.ok(!staticRoots.includes(path.resolve(__dirname, '..')));
  assert.ok(routes.has('/') && routes.has('/script.js') && routes.has('/style.css'));
});

test('scorecard fields are inserted as text instead of HTML', () => {
  const nodes = new Map();
  const element = () => ({ children: [], style: {}, appendChild(child) { this.children.push(child); },
    set innerHTML(value) { assert.equal(value, '', 'remote data must not be parsed as HTML'); this.children = []; } });
  const lookup = key => { if (!nodes.has(key)) nodes.set(key, element()); return nodes.get(key); };
  const context = { document: { querySelector: lookup, getElementById: lookup, createElement: element } };
  const code = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8').replace(/\ninit\(\);\s*$/, '\n');
  vm.runInNewContext(code, context);
  const markup = '<img src=x onerror=alert(1)>';
  context.updateUI({ matchSummary: { teams: [] }, batsmen: [{ name: markup, runs: markup }], bowlers: [{ name: markup, wickets: markup }], recentBalls: [] });
  assert.equal(nodes.get('#batsmenTable tbody').children[0].children[0].textContent, markup);
  assert.equal(nodes.get('#bowlerTable tbody').children[0].children[0].textContent, markup);
});
