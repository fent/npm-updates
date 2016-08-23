/* jshint quotmark:false, maxlen: false */
var NPM         = require('..');
var assert      = require('assert');
var path        = require('path');
var fs          = require('fs');
var PassThrough = require('stream').PassThrough;
var nock        = require('nock');
var sinon       = require('sinon');


var HOST = 'https://skimdb.npmjs.com';

var expectedChanges = [
  {"seq":99230,"id":"newsemitter","changes":[{"rev":"5-aca7782ab6beeaef30c36b888f817d2e"}]},
  {"seq":99235,"id":"chain-tiny","changes":[{"rev":"19-82224279a743d2744f10d52697cdaea9"}]},
  {"seq":99238,"id":"Hanzi","changes":[{"rev":"4-5ed20f975bd563ae5d1c8c1d574fe24c"}],"deleted":true}
];

var expectedNews = ['newsemitter@0.1.0'];
var expectedUpdates = ['chain-tiny@0.2.1'];
var expectedPublished = ['newsemitter@0.1.0', 'chain-tiny@0.2.1'];
var expectedDeleted = ['Hanzi'];

var clock;
before(function() { clock = sinon.useFakeTimers(); });
after(function() { clock.restore(); });
afterEach(function() { nock.cleanAll(); });

describe('Start it up', function() {
  it('Emits expected module updates', function(done) {
    var req1 = nock(HOST)
      .get('/registry/_changes?feed=continuous&since=1')
      .replyWithFile(200, path.join(__dirname, 'assets', 'changes1.json'));

    var req2 = nock(HOST)
      .get('/registry/_changes?feed=continuous&since=53')
      .replyWithFile(200, path.join(__dirname, 'assets', 'changes2.json'));

    var req3 = nock(HOST)
      .get('/registry/newsemitter')
      .replyWithFile(200, path.join(__dirname, 'assets', 'newsemitter.json'));

    var req4 = nock(HOST)
      .get('/registry/chain-tiny')
      .replyWithFile(200, path.join(__dirname, 'assets', 'chain-tiny.json'));

    var npm       = new NPM();
    var changes   = [];
    var news      = [];
    var updated   = [];
    var published = [];
    var deleted   = [];

    npm.once('stream-end', function() {
      clock.tick(500);
    });

    npm.on('change', function(obj) {
      changes.push(obj);
    });

    npm.on('new', function(info) {
      news.push(info.name + '@' + info.version);
    });

    npm.on('update', function(info) {
      updated.push(info.name + '@' + info.version);
    });

    npm.on('publish', function(info) {
      published.push(info.name + '@' + info.version);
      if (published.length >= 2) {
        npm.stop();
        assert.deepEqual(expectedChanges, changes);
        assert.deepEqual(expectedNews, news);
        assert.deepEqual(expectedUpdates, updated);
        assert.deepEqual(expectedPublished, published);
        assert.deepEqual(expectedDeleted, deleted);
        req1.done();
        req2.done();
        req3.done();
        req4.done();
        done();
      }
      clock.tick(500);
    });

    npm.on('delete', function(name) {
      deleted.push(name);
    });
  });
});

describe('Long running stream', function() {
  it('Emits changes after some time on first request', function(done) {
    var npm = new NPM();
    var changes = sinon.spy();

    var req1 = nock(HOST)
      .get('/registry/_changes?feed=continuous&since=1')
      .reply(200, function() {
        var stream = new PassThrough();
        var file1 = path.join(__dirname, 'assets', 'changes1.json');
        fs.readFile(file1, function(err, body) {
          if (err) return done(err);
          stream.write(body);
          assert.equal(changes.length, 0);

          // Wait some time before next data event..
          setTimeout(function() {
            var file2 = path.join(__dirname, 'assets', 'changes2.json');
            fs.readFile(file2, function(err, body) {
              if (err) return done(err);
              stream.end(body);
            });
          }, 3000);
          clock.tick(3000);
        });
        return stream;
      });

    nock(HOST)
      .get('/registry/newsemitter')
      .replyWithFile(200, path.join(__dirname, 'assets', 'newsemitter.json'));

    nock(HOST)
      .get('/registry/chain-tiny')
      .replyWithFile(200, path.join(__dirname, 'assets', 'chain-tiny.json'))
      .on('request', function() {
        npm.stop();
        assert.equal(changes.callCount, 3);
        req1.done();
        done();
      });

    npm.on('change', changes);

    npm.on('stream-end', function() {
      npm.stop();
      clock.tick(500);
    });

  });
});

describe('Start it up more than once', function() {
  it('Makes just one request', function(done) {
    var req1 = nock(HOST)
      .get('/registry/_changes?feed=continuous&since=1')
      .replyWithFile(200, path.join(__dirname, 'assets', 'changes1.json'));

    var npm = new NPM({ autoStart: false });
    npm.start();
    npm.start();
    npm.on('stream-end', function() {
      npm.stop();
      req1.done();
      done();
    });
  });
});

describe('End it before first request ends', function() {
  it('Aborts the request in progress', function(done) {
    var req1 = nock(HOST)
      .get('/registry/_changes?feed=continuous&since=1')
      .replyWithFile(200, path.join(__dirname, 'assets', 'changes1.json'));

    var req2 = nock(HOST)
      .get('/registry/_changes?feed=continuous&since=53')
      .replyWithFile(200, path.join(__dirname, 'assets', 'changes3.json'));

    var npm = new NPM();

    npm.once('stream-end', function() {
      clock.tick(500);
    });

    npm.on('change', function() {
      npm.stop();
      clock.tick(3000);
      req1.done();
      req2.done();
      done();
    });
  });
});

describe('Stream has same module more than once in short time', function() {
  it('Emits changes for it once', function(done) {
    var req1 = nock(HOST)
      .get('/registry/_changes?feed=continuous&since=2')
      .replyWithFile(200, path.join(__dirname, 'assets', 'changes4.json'));

    var req2 = nock(HOST)
      .get('/registry/newsemitter')
      .replyWithFile(200, path.join(__dirname, 'assets', 'newsemitter.json'));

    var npm = new NPM({ lastSeq: 2 });
    var changeSpy = sinon.spy();

    npm.on('change', changeSpy);

    npm.once('stream-end', function() {
      npm.stop();
      assert.ok(changeSpy.calledOnce);
      clock.tick(500);
      req1.done();
      req2.done();
      done();
    });
  });

  it('Emits changes after info timeout', function(done) {
    var req1 = nock(HOST)
      .get('/registry/_changes?feed=continuous&since=2')
      .replyWithFile(200, path.join(__dirname, 'assets', 'changes4.json'));

    nock(HOST)
      .get('/registry/newsemitter')
      .replyWithFile(200, path.join(__dirname, 'assets', 'newsemitter.json'));

    nock(HOST)
      .get('/registry/newsemitter')
      .replyWithFile(200, path.join(__dirname, 'assets', 'newsemitter.json'));

    var req4 = nock(HOST)
      .get('/registry/_changes?feed=continuous&since=99230')
      .reply(200, function() {
        var stream = new PassThrough();
        process.nextTick(function() {
          var filepath = path.join(__dirname, 'assets', 'changes4.json');
          fs.createReadStream(filepath).pipe(stream);
        });
        return stream;
      });

    var npm = new NPM({ lastSeq: 2 });
    var changeSpy = sinon.spy();
    npm.on('change', changeSpy);

    function onDone() {
      assert.ok(changeSpy.calledTwice);
      req1.done();
      req4.done();
      done();
    }

    npm.on('publish', function() {
      clock.tick(10000);
    });

    npm.once('stream-end', function() {
      assert.ok(changeSpy.calledOnce);
      clock.tick(500);

      npm.once('stream-end', function() {
        npm.stop();
        process.nextTick(function() {
        process.nextTick(function() {
          onDone();
        });
        });
      });
    });
  });
});

describe('NPM#getInfo()', function() {
  describe('Try retrieving a package without dist-tags', function() {
    it('Makes no more than n requests', function(done) {
      var req1 = nock(HOST)
        .get('/registry/newsemitter')
        .reply(200, '{}');
      var req2 = nock(HOST)
        .get('/registry/newsemitter')
        .reply(200, '{"dist-tags":{}}');
      var req3 = nock(HOST)
        .get('/registry/newsemitter')
        .reply(200, '{}');

      req1.on('replied', function() {
        process.nextTick(function() {
          clock.tick(10000);
        });
      });
      req2.on('replied', function() {
        process.nextTick(function() {
          clock.tick(10000);
        });
      });
      req3.on('replied', function() {
        process.nextTick(function() {
          clock.tick(10000);
          req1.done();
          req2.done();
          req3.done();
          done();
        });
      });

      var npm = new NPM({ autoStart: false });
      npm.on('publish', function() {
        throw Error('Should not publish without dist-tags');
      });
      npm.getInfo('newsemitter');
    });
  });

  describe('Try to retrieve a module that returns an error', function() {
    it('Emits an error', function(done) {
      var req1 = nock(HOST)
        .get('/registry/newsemitter')
        .replyWithError('Something awful happened');

      var npm = new NPM({ autoStart: false });
      npm.on('error', function(err) {
        assert.ok(/awful/.test(err.message));
        req1.done();
        done();
      });
      npm.getInfo('newsemitter');
    });
  });

  describe('Try to retrieve a non-existant module', function() {
    it('Emits an error', function(done) {
      var req1 = nock(HOST)
        .get('/registry/dontexist')
        .reply(404);

      var npm = new NPM({ autoStart: false });
      npm.on('error', function(err) {
        assert.ok(/Status Code: 404/.test(err.message));
        req1.done();
        done();
      });
      npm.getInfo('dontexist');
    });
  });
});
