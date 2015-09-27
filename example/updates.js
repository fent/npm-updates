var NPM = require('..');
var npm = new NPM();

npm.on('update', function(info) {
  console.log('package', info.name, 'was updated to v' + info.version);
});

npm.on('new', function(info) {
  console.log('new module!', info.name);
});
