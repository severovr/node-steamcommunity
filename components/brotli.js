var zlib = require('zlib');
var Request = require('request');

// request only knows how to decompress gzip and deflate; any other
// Content-Encoding (including br) is passed through still-compressed.
// The decompressor choice is made inline inside onRequestResponse, so the
// only way to hook it without copying the whole function is: when a brotli
// response arrives, relabel it as gzip and substitute zlib.createGunzip with
// a brotli decompressor for the synchronous duration of the original handler.
// Node is single-threaded, so nothing else can observe the substitution.

var originalOnRequestResponse = Request.Request.prototype.onRequestResponse;

Request.Request.prototype.onRequestResponse = function(response) {
	var contentEncoding = (response.headers['content-encoding'] || '').trim().toLowerCase();
	if (!this.gzip || contentEncoding != 'br' || typeof zlib.createBrotliDecompress != 'function') {
		return originalOnRequestResponse.apply(this, arguments);
	}

	response.headers['content-encoding'] = 'gzip';
	// on modern Node the zlib module's properties are writable: false but
	// configurable: true, so plain assignment is silently ignored
	var originalDescriptor = Object.getOwnPropertyDescriptor(zlib, 'createGunzip');
	Object.defineProperty(zlib, 'createGunzip', {
		configurable: true,
		enumerable: true,
		value: function() {
			return zlib.createBrotliDecompress();
		}
	});

	try {
		return originalOnRequestResponse.apply(this, arguments);
	} finally {
		Object.defineProperty(zlib, 'createGunzip', originalDescriptor);
		response.headers['content-encoding'] = 'br';
	}
};
