/* eslint quotes: "off", maxlen: "off" */
const NPM         = require('..');
const assert      = require('assert');
const path        = require('path');
const fs          = require('fs');
const PassThrough = require('stream').PassThrough;
const nock        = require('nock');
const sinon       = require('sinon');


const HOST = 'https://skimdb.npmjs.com';

const expectedChanges = [
  {"seq":99230,"id":"newsemitter","changes":[{"rev":"5-aca7782ab6beeaef30c36b888f817d2e"}]},
  {"seq":99235,"id":"chain-tiny","changes":[{"rev":"19-82224279a743d2744f10d52697cdaea9"}]},
  {"seq":99238,"id":"Hanzi","changes":[{"rev":"4-5ed20f975bd563ae5d1c8c1d574fe24c"}],"deleted":true}
];

const expectedNews = ['newsemitter@0.1.0'];
const expectedUpdates = ['chain-tiny@0.2.1'];
const expectedPublished = ['newsemitter@0.1.0', 'chain-tiny@0.2.1'];
const expectedDeleted = ['Hanzi'];

afterEach(() => { nock.cleanAll(); });

describe('NPM#start()', () => {
  let clock;
  before(() => clock = sinon.useFakeTimers());
  after(() => clock.restore());

  describe('Start it up', () => {
    it('Emits expected module updates', (done) => {
      const req1 = nock(HOST)
        .get('/registry/_changes?feed=continuous&since=1')
        .replyWithFile(200, path.join(__dirname, 'assets', 'changes1.json'));

      const req2 = nock(HOST)
        .get('/registry/_changes?feed=continuous&since=53')
        .replyWithFile(200, path.join(__dirname, 'assets', 'changes2.json'));

      const req3 = nock(HOST)
        .get('/registry/newsemitter')
        .replyWithFile(200, path.join(__dirname, 'assets', 'newsemitter.json'));

      const req4 = nock(HOST)
        .get('/registry/chain-tiny')
        .replyWithFile(200, path.join(__dirname, 'assets', 'chain-tiny.json'));

      const npm       = new NPM();
      const changes   = [];
      const news      = [];
      const updated   = [];
      const published = [];
      const deleted   = [];

      npm.once('stream-end', () => {
        clock.tick(500);
      });

      npm.on('change', (obj) => {
        changes.push(obj);
      });

      npm.on('new', (info) => {
        news.push(info.name + '@' + info.version);
      });

      npm.on('update', (info) => {
        updated.push(info.name + '@' + info.version);
      });

      npm.on('publish', (info) => {
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

      npm.on('delete', (name) => {
        deleted.push(name);
      });
    });
  });

  describe('Long running stream', () => {
    it('Emits changes after some time on first request', (done) => {
      const npm = new NPM();
      const changes = sinon.spy();

      const req1 = nock(HOST)
        .get('/registry/_changes?feed=continuous&since=1')
        .reply(200, () => {
          const stream = new PassThrough();
          const file1 = path.join(__dirname, 'assets', 'changes1.json');
          fs.readFile(file1, (err, body) => {
            assert.ifError(err);
            stream.write(body);
            assert.equal(changes.length, 0);

            // Wait some time before next data event..
            setTimeout(() => {
              const file2 = path.join(__dirname, 'assets', 'changes2.json');
              fs.readFile(file2, (err, body) => {
                assert.ifError(err);
                stream.end(body);
              });
            }, 3000);
            clock.tick(3000);
          });
          return stream;
        });

      const req2 = nock(HOST)
        .get('/registry/newsemitter')
        .replyWithFile(200, path.join(__dirname, 'assets', 'newsemitter.json'));

      nock(HOST)
        .get('/registry/chain-tiny')
        .replyWithFile(200, path.join(__dirname, 'assets', 'chain-tiny.json'))
        .on('request', () => {
          npm.stop();
          assert.equal(changes.callCount, 3);
          req1.done();
          req2.done();
          done();
        });

      npm.on('change', changes);

      npm.on('stream-end', () => {
        npm.stop();
        clock.tick(500);
      });

    });
  });

  describe('Start it up more than once', () => {
    it('Makes just one request', (done) => {
      const req1 = nock(HOST)
        .get('/registry/_changes?feed=continuous&since=1')
        .replyWithFile(200, path.join(__dirname, 'assets', 'changes1.json'));

      const npm = new NPM({ autoStart: false });
      npm.start();
      npm.start();
      npm.on('stream-end', () => {
        npm.stop();
        req1.done();
        done();
      });
    });
  });

  describe('End it before first request ends', () => {
    it('Aborts the request in progress', (done) => {
      const req1 = nock(HOST)
        .get('/registry/_changes?feed=continuous&since=1')
        .replyWithFile(200, path.join(__dirname, 'assets', 'changes1.json'));

      const req2 = nock(HOST)
        .get('/registry/_changes?feed=continuous&since=53')
        .replyWithFile(200, path.join(__dirname, 'assets', 'changes3.json'));

      const npm = new NPM();

      npm.once('stream-end', () => {
        clock.tick(500);
      });

      npm.on('change', () => {
        npm.stop();
        clock.tick(3000);
        req1.done();
        req2.done();
        done();
      });
    });
  });

  describe('Stream has same module more than once in short time', () => {
    it('Emits changes for it once', (done) => {
      const req1 = nock(HOST)
        .get('/registry/_changes?feed=continuous&since=2')
        .replyWithFile(200, path.join(__dirname, 'assets', 'changes4.json'));

      const req2 = nock(HOST)
        .get('/registry/newsemitter')
        .replyWithFile(200, path.join(__dirname, 'assets', 'newsemitter.json'));

      const npm = new NPM({ lastSeq: 2 });
      const changeSpy = sinon.spy();

      npm.on('change', changeSpy);

      npm.once('stream-end', () => {
        npm.stop();
        assert.ok(changeSpy.calledOnce);
        clock.tick(500);
        req1.done();
        req2.done();
        done();
      });
    });

    it('Emits changes after info timeout', (done) => {
      const req1 = nock(HOST)
        .get('/registry/_changes?feed=continuous&since=2')
        .replyWithFile(200, path.join(__dirname, 'assets', 'changes4.json'));

      const req2 = nock(HOST)
        .get('/registry/newsemitter')
        .replyWithFile(200, path.join(__dirname, 'assets', 'newsemitter.json'));

      const req3 = nock(HOST)
        .get('/registry/newsemitter')
        .replyWithFile(200, path.join(__dirname, 'assets', 'newsemitter.json'));

      const req4 = nock(HOST)
        .get('/registry/_changes?feed=continuous&since=99230')
        .reply(200, () => {
          const stream = new PassThrough();
          process.nextTick(() => {
            const filepath = path.join(__dirname, 'assets', 'changes4.json');
            fs.createReadStream(filepath).pipe(stream);
          });
          return stream;
        });

      const npm = new NPM({ lastSeq: 2 });
      const changeSpy = sinon.spy();
      npm.on('change', changeSpy);

      npm.on('publish', () => {
        clock.tick(10000);
      });

      npm.once('stream-end', () => {
        assert.ok(changeSpy.calledOnce);
        clock.tick(500);

        npm.once('stream-end', () => {
          npm.stop();
          process.nextTick(() => {
            assert.ok(changeSpy.calledTwice);
            req1.done();
            req2.done();
            req3.done();
            req4.done();
            done();
          });
        });
      });
    });
  });
});

describe('NPM#getInfo()', () => {
  let setTimeout = global.setTimeout;
  before(() => { global.setTimeout = (fn, ms, ...args) => {
    setTimeout(fn, 0, ...args);
  }; });
  after(() => { global.setTimeout = setTimeout; });
  describe('Try retrieving a package without dist-tags', () => {
    it('Makes no more than n requests', (done) => {
      const req1 = nock(HOST)
        .get('/registry/newsemitter')
        .reply(200, '{}');
      const req2 = nock(HOST)
        .get('/registry/newsemitter')
        .reply(200, '{"dist-tags":{}}');
      const req3 = nock(HOST)
        .get('/registry/newsemitter')
        .reply(200, '{}');

      req3.on('replied', () => {
        process.nextTick(() => {
          req1.done();
          req2.done();
          req3.done();
          done();
        });
      });

      const npm = new NPM({ autoStart: false });
      npm.on('publish', () => {
        throw Error('Should not publish without dist-tags');
      });
      npm.getInfo('newsemitter');
    });
  });

  describe('Try to retrieve a module that returns an error', () => {
    it('Emits an error', (done) => {
      const req1 = nock(HOST)
        .get('/registry/newsemitter')
        .replyWithError('Something awful happened');

      const npm = new NPM({ autoStart: false });
      npm.on('error', (err) => {
        assert.ok(/awful/.test(err.message));
        req1.done();
        done();
      });
      npm.getInfo('newsemitter');
    });
  });

  describe('Try to retrieve a non-existant module', () => {
    it('Emits an error', (done) => {
      const req1 = nock(HOST)
        .get('/registry/dontexist')
        .reply(404);

      const npm = new NPM({ autoStart: false });
      npm.on('error', (err) => {
        assert.ok(/Status Code: 404/.test(err.message));
        req1.done();
        done();
      });
      npm.getInfo('dontexist');
    });
  });
});
