/*jshint quotmark:false */
var assert = require('assert');
var path   = require('path');
var url    = require('url');
var fs     = require('fs');
var muk    = require('muk');


var expectedChanges = [
  {"seq":99230,"id":"newsemitter","changes":[{"rev":"5-aca7782ab6beeaef30c36b888f817d2e"}]}
, {"seq":99235,"id":"chain-tiny","changes":[{"rev":"19-82224279a743d2744f10d52697cdaea9"}]}
, {"seq":99238,"id":"Hanzi","changes":[{"rev":"4-5ed20f975bd563ae5d1c8c1d574fe24c"}],"deleted":true}
];

var expectedNews = ['newsemitter@0.1.0'];
var expectedUpdates = ['chain-tiny@0.2.1'];
var expectedPublished = ['newsemitter@0.1.0', 'chain-tiny@0.2.1'];
var expectedDeleted = ['Hanzi'];

describe('npm-updates', function() {
  var NPM = muk('..', {
    request: function request(options, callback) {
      var filepath;
      var uripath = url.parse(options.uri).path;
      switch (uripath) {
        case '/registry/_changes?feed=continuous&since=1':
          filepath = path.join(__dirname, 'assets', 'changes1.json');
          return fs.createReadStream(filepath);

        case '/registry/_changes?feed=continuous&since=53':
          filepath = path.join(__dirname, 'assets', 'changes2.json');
          return fs.createReadStream(filepath);

        case '/registry/newsemitter':
          filepath = path.join(__dirname, 'assets', 'newsemitter.json');
          fs.readFile(filepath, function(err, data) {
            if (err) return callback(err);
            callback(null, { statusCode: 200 }, JSON.parse(data));
          });
          break;

        case '/registry/chain-tiny':
          filepath = path.join(__dirname, 'assets', 'chain-tiny.json');
          fs.readFile(filepath, function(err, data) {
            if (err) return callback(err);
            callback(null, { statusCode: 200 }, JSON.parse(data));
          });
          break;
        default:
          throw Error('Unable to match path: ' + uripath);
      }
    }
  });

  var npm = new NPM({ autoStart: false })
    , changes = []
    , newModules = []
    , updatedModules = []
    , publishedModules = []
    , deletedModules = []
    ;

  npm.on('change', function(obj) {
    changes.push(obj);
  });

  npm.on('new', function(info) {
    newModules.push(info.name + '@' + info.version);
  });

  npm.on('update', function(info) {
    updatedModules.push(info.name + '@' + info.version);
  });

  npm.on('publish', function(info) {
    publishedModules.push(info.name + '@' + info.version);
    if (publishedModules.length === 2) {
      npm.emit('done');
    }
  });

  npm.on('delete', function(name) {
    deletedModules.push(name);
  });

  it('Emits `changes` events', function(done) {
    npm.on('done', function() {
      assert.equal(expectedChanges.length, changes.length);
      assert.deepEqual(expectedChanges[0], changes[0]);
      assert.deepEqual(expectedChanges[1], changes[1]);
      assert.deepEqual(expectedChanges[2], changes[2]);
      assert.deepEqual(expectedChanges[3], changes[3]);
      done();
    });
    npm.start();
  });

  it('Emits `new` events', function() {
    assert.equal(expectedNews.length, newModules.length);
    assert.deepEqual(expectedNews[0], newModules[0]);
  });

  it('Emits `update` events', function() {
    assert.equal(expectedUpdates.length, updatedModules.length);
    assert.deepEqual(expectedUpdates[0], updatedModules[0]);
  });

  it('Emits `published` events', function() {
    assert.equal(expectedPublished.length, publishedModules.length);
    assert.deepEqual(expectedPublished[0], publishedModules[0]);
    assert.deepEqual(expectedPublished[1], publishedModules[1]);
  });

  it('Emits `delete` events', function() {
    assert.equal(expectedDeleted.length, deletedModules.length);
    assert.deepEqual(expectedDeleted[0], deletedModules[0]);
  });
});
