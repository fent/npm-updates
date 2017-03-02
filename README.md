# npm-updates

Emits update events from the npm repository, or any node modules repository.

[![Build Status](https://secure.travis-ci.org/fent/npm-updates.svg)](http://travis-ci.org/fent/npm-updates)
[![Dependency Status](https://david-dm.org/fent/npm-updates.svg)](https://david-dm.org/fent/npm-updates)
[![codecov](https://codecov.io/gh/fent/npm-updates/branch/master/graph/badge.svg)](https://codecov.io/gh/fent/npm-updates)

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

* `autoStart` - Defaults to `true`. Will auto start requesting the registry for updates. If disabled, you can use `start()`.
* `uri` - You can set the couchdb registry uri that it checks with this.

### NPM#start()

Starts receiving updates.

### NPM#stop()

Stops requesting updates and emitting events.

### Event: 'change'
* `Object`

Change events from the couchdb _changes feed.

```js
{ seq: 99230,
  id: 'newsemitter',
  changes: [ { rev: '5-aca7782ab6beeaef30c36b888f817d2e' } ] }
```

### Event: 'new'
* `Object` - Info.

First version of module published. `info` is equivalent to its `package.json` contents.

### Event: 'update'
* `Object` - Info.

 Module is updated to a newer version. `info` is equivalent to its `package.json` contents.


### Event: 'publish'
* `Object` - Info.

Emitted for both `new` and `update` events. `info` is equivalent to its `package.json` contents.

### Event: 'delete'
* `string` - Name.

Module was deleted from the registry.


# Install

    npm install npm-updates


# Tests
Tests are written with [mocha](http://visionmedia.github.com/mocha/)

```bash
npm test
```

# License
MIT
