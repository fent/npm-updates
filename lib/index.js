const EventEmitter = require('events').EventEmitter;
const request      = require('request');
const JStream      = require('jstream');
const NPM_REGISTRY = 'https://skimdb.npmjs.com/registry/';


module.exports = class NPM extends EventEmitter {
  /**
   * @constructor
   * @extends {EventEmitter}
   */
  constructor(options) {
    super();

    this.options = Object.assign({
      lastSeq        : 1,
      timeBetween    : 500,
      changesTimeout : 3000,
      infoTimeout    : 10000,
      autoStart      : true,
      uri            : NPM_REGISTRY,
    }, options);

    this.first = this.options.lastSeq === 1;
    this.gettingInfo = {};
    this.paused = true;

    if (this.options.autoStart) {
      this.start();
    }
  }


  /**
   * Starts getting updates.
   */
  start() {
    if (!this.paused) return;
    this.paused = false;
    this.request();
  }


  /**
   * Stops requesting updates from registry.
   */
  stop() {
    this.paused = true;
    if (this.lastRequest) {
      this.lastRequest.abort();
    }
    clearTimeout(this.tid1);
    clearTimeout(this.tid3);
  }


  /**
   * Gets updates.
   */
  request() {
    const options = {
      uri: `${this.options.uri}_changes?feed=continuous&since=${this.options.lastSeq}`,
      proxy: process.env.http_proxy,
    };

    const jstream = new JStream();
    this.lastRequest = request(options);
    this.lastRequest.pipe(jstream);

    jstream.on('data', (data) => {
      // Check if this is a change object.
      if (!data.seq || !data.id || !data.changes) return;
      this.options.lastSeq = data.seq;

      // Don't emit anything if this is the first request.
      if (this.first) {
        clearTimeout(this.tid2);
        this.tid2 = setTimeout(() => {
          this.first = false;
        }, this.options.changesTimeout);
        return;
      }

      // Don't emit if in getting info.
      if (data.id in this.gettingInfo) return;

      this.emit('change', data);

      // Package might have been deleted.
      if (data.deleted) {
        return this.emit('delete', data.id);
      }

      // If not, get its info.
      this.getInfo(data.id);
    });

    jstream.on('error', this.emit.bind(this, 'error'));

    jstream.on('end', () => {
      this.lastRequest = null;
      this.first = false;
      clearTimeout(this.tid2);

      this.tid1 = setTimeout(() => {
        if (!this.paused) {
          this.request();
        }
      }, this.options.timeBetween);
      this.emit('stream-end');
    });
  }


  /**
   * Get package info.
   *
   * @param {string} name
   * @param {number} n
   */
  getInfo(name, n) {
    // Sometimes the package endpoint takes a while to become available after
    // a module is first published. This will try up to 3 times.
    if (n > 3) return;

    const options = {
      uri   : this.options.uri + name,
      json  : true,
      proxy : process.env.http_proxy,
    };

    // Don't request info of same module at the same time.
    clearTimeout(this.gettingInfo[name]);
    this.gettingInfo[name] = true;

    request(options, (err, res, json) => {
      this.gettingInfo[name] = setTimeout(() => {
        delete this.gettingInfo[name];
      }, this.options.infoTimeout);

      if (err) return this.emit('error', err);
      if (res.statusCode !== 200) {
        this.emit('error', Error('Status Code: ' + res.statusCode));
        return;
      }

      // If there is no latest key, this is a new package
      // that hasn't been updated yet.
      if (!json['dist-tags'] || !json['dist-tags'].latest) {
        this.tid3 = setTimeout(() => {
          this.getInfo(name, (n || 1) + 1);
        }, this.options.infoTimeout);
        return;
      }

      const info = json.versions[json['dist-tags'].latest];

      // If there is only one version, consider this is a new package
      // might be wrong if this update was forced.
      if (Object.keys(json.versions).length === 1) {
        this.emit('new', info);
      } else {
        this.emit('update', info);
      }

      this.emit('publish', info);
    });
  }
};
