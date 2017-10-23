const NPM = require('..');
const npm = new NPM();

npm.on('update', (info) => {
  console.log(`package ${info.name} was updated to v${info.version}`);
});

npm.on('new', (info) => {
  console.log('new module!', info.name);
});
