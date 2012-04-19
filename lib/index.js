var EventEmitter = require('events').EventEmitter
  , util = require('util')
  , url = require('url')
  , request = require('request')
  , JStream = require('jstream')
  , NPM_REGISTRY = 'http://isaacs.ic.ht/registry/'


/**
 * @constructor
 * @extends (EventEmitter)
 */
var NPM = module.exports = function(options) {
  EventEmitter.call(this);

  var defaults = {
    lastSeq: 1
  , timeBetween: 500
  , changesTimeout: 3000
  , infoTimeout: 10000
  , autoStart: true
  , uri: NPM_REGISTRY
  };

  options = options || {};
  for (var key in defaults) {
    if (!defaults.hasOwnProperty(key)) continue;
    this[key] = options[key] !== undefined ? options[key] : defaults[key];
  }
    
  this.first = !options.lastSeq;
  this.gettingInfo = {};
  this.paused = true;

  if (this.autoStart) {
    this.start();
  }
};
util.inherits(NPM, EventEmitter);


/**
 * Starts getting updates
 */
NPM.prototype.start = function() {
  if (!this.paused) return;
  this.paused = false;
  this.request();
};


/**
 * Stops requesting updates from registry
 */
NPM.prototype.stop = function() {
  this.paused = true;
  if (this.lastRequest) {
    this.lastRequest.abort();
  }
  clearTimeout(this.tid1);
  clearTimeout(this.tid3);
}


/**
 * Gets updates
 */
NPM.prototype.request = function() {
  var self = this;
  var options = {
    uri: this.uri + '_changes?feed=continuous&since=' + this.lastSeq
  , onResponse: true
  , encoding: 'utf8'
  , proxy: process.env.http_proxy
  };

  var jstream = new JStream();
  self.lastRequest = request(options).pipe(jstream);

  jstream.on('data', function(data) {
    // check if this is a change object
    if (!data.seq || !data.id || !data.changes) return;
    self.lastSeq = data.seq;

    // don't emit anything if this is the first request
    if (self.first) {
      clearTimeout(self.tid2);
      self.tid2 = setTimeout(function() {
        self.first = false;
      }, self.changesTimeout);
      return;
    }

    // don't emit if in getting info
    if (data.id in self.gettingInfo) return;

    self.emit('change', data);

    // package might have been deleted
    if (data.deleted) {
      return self.emit('delete', data.id);
    }

    // if not, get its info
    self.getInfo(data.id);
  });

  jstream.on('error', self.emit.bind(self, 'error'));

  jstream.on('end', function() {
    self.lastRequest = null;
    self.first = false;
    clearTimeout(self.tid2);

    if (!self.paused) {
      self.tid1 = setTimeout(function() {
        self.request();
      }, self.timeBetween);
    }
  });
};


/**
 * Get package info
 * @param (string) name
 * @param (number) n
 */
NPM.prototype.getInfo = function(name, n) {
  if (n > 3) return;
  var self = this;
  var options = {
    uri: self.uri + name
  , encoding: 'utf8'
  , proxy: process.env.http_proxy
  };

  // don't request info of same module at the same time
  clearTimeout(self.gettingInfo[name]);
  self.gettingInfo[name] = true;

  request(options, function(err, res, body) {
    self.gettingInfo[name] = setTimeout(function() {
      delete self.gettingInfo[name];
    }, self.infoTimeout);

    if (err) return self.emit('error', err);
    if (res.statusCode !== 200) {
      self.emit('error', new Error('Status Code: ' + res.statusCode));
      return;
    }

    try {
      var json = JSON.parse(body);

      // if there is no latest key, this is a new package
      // that hasn't been updated yet
      if (!json['dist-tags'] || !json['dist-tags'].latest) {
        self.tid3 = setTimeout(function() {
          self.getInfo(name, n + 1);
        }, self.infoTimeout);
        return;
      }

      var info = json.versions[json['dist-tags'].latest];

      // if there is only one version, consider this is a new package
      // might be wrong if this update was forced
      if (Object.keys(json.versions).length === 1) {
        self.emit('new', info);
      } else {
        self.emit('update', info);
      }

      self.emit('publish', info);

    } catch (err) {
      self.emit('error', err);
    }
  });
};
