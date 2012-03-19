# npm-updates [![Build Status](https://secure.travis-ci.org/fent/npm-updates.png)](http://travis-ci.org/fent/npm-updates)

Emits update events from the npm repository, or any node modules repository.

# Usage

```js
var NPM = require('npm-updates');
var npm = new NPM();

npm.on('update', function(info) {
  console.log('package', info.name, 'was updated to v' + info.version);
});

npm.on('new', function(info) {
  console.log('new module!', info.name);
});
```

# API

### new NPM([options])

Creates a new instance. `options` can have
for up
* `autoStart` - Defaults to `true`. Will auto start requesting the registry for updates. If disabled, you can use `start()`.
* `uri` - You can set the couchdb registry uri that it checks with this.

### NPM#start()

Starts receiving updates.

### NPM#stop()

Stops requesting updates and emitting events.


# Install

    npm install npm-updates


# Tests
Tests are written with [mocha](http://visionmedia.github.com/mocha/)

```bash
npm test
```

# License
MIT
