const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');

test('real Express routes reject unsafe queries, hide source and parse a synthetic scorecard', async t => {
  const app = require('express')();
  app.listen = () => {};
  let subprocessCalls = 0;
  const child = { execFile(_program, _args, _options, callback) {
    subprocessCalls++;
    callback(null, '<html><title>Synthetic Match</title><body></body></html>');
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8'), {
    require(name) { return name === 'express' ? () => app : name === 'child_process' ? child : require(name); },
    __dirname:path.resolve(__dirname,'..'), URL, process, console:{log(){},error(){}},
  });
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => {server.close(resolve); server.closeAllConnections();}));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base+'/api/live-score?league=TCL%26evil')).status,400);
  assert.equal(subprocessCalls,0);
  assert.equal((await fetch(base+'/server.js')).status,404);
  assert.equal((await fetch(base+'/')).status,200);
  const response=await fetch(base+'/api/live-score?league=TCL&matchId=5405&clubId=157');
  assert.equal(response.status,200);
  assert.equal((await response.json()).matchSummary.title,'Synthetic Match');
  assert.equal(subprocessCalls,1);
});
