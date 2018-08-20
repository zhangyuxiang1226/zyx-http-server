#! /usr/bin/env node
let Server = require('../src/index.js');
let commander = require('commander');
let {version} = require('../package.json');

commander
.option('-p,--port <n>', 'config port')
.option('-o,--host [value]', 'config hostname')
.option('-d,--dir [value]', 'config directory')
.version(version, '-v,--version').parse(process.argv);

let server = new Server(commander);
server.start();

let config =require('../src/config');

commander = {...config, ...commander}

let os = require('os');
let {exec} = require('child_process')
if (os.platform() === 'win32') {
    exec(`start http://${commander.host}:${commander.port}`);
}
else {
    exec(`open http://${commander.host}:${commander.port}`);
}
