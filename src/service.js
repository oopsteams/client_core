const http = require('http');
const https = require('https');
const querystring = require('querystring');
const URL = require('url');
const helpers = require("./helper.core.js")
const fs = require('fs');
const request = require('request');
var api = {
	download_lib_file: function(target_file_path, upurl, callback) {
		if (fs.existsSync(target_file_path)) {
			fs.unlinkSync(target_file_path);
		}
		let stream = fs.createWriteStream(target_file_path);
		var options = {
			method: 'GET',
			url: upurl,
			timeout: 120000,
			strictSSL: false
		};
		var rq = request(options);
		var pipe = rq.pipe(stream);
		pipe.on("close", function() {
			// console.log("文件["+upurl+"] on close ===>:", upurl);
			stream.end();
		});
		rq.on("error", function(err) {
			// console.log("rq error 文件["+upurl+"]下载失败!===>",err);

		}).on("timeout", function() {
			// console.log("rq error 文件["+upurl+"]下载超时失败!");

		}).on("aborted", function() {
			// console.log("rq error 文件["+upurl+"]下载被中断失败!");

		}).on("response", (res) => {
			if (res) {
				// console.log('download headers:', res.headers);
				res.on('end', () => {
					if (res.complete) {
						callback(null, target_file_path);
					} else {
						callback("failed", null);
					}
				});
			}
		});

	},
	post_json_server: function(tk, path, params, cb, _options) {
		const post_json_data = JSON.stringify(params);
		var headers = {
			"SURI-TOKEN": tk,
			"Content-Type": "application/json",
			'Content-Length': Buffer.byteLength(post_json_data)
		};
		var options = URL.parse(helpers.point + path);
		var opt = {
			method: 'POST',
			timeout: 120000,
			insecureHTTPParser: true,
			headers: headers
		};
		helpers.extend(options, opt);
		if (_options && _options.options) {
			helpers.extend(options, _options.options);
		}
		// console.log("post_server options:", options);
		var client_http_engine = http;
		if (options.protocol.indexOf('https:') >= 0) {
			client_http_engine = https;
			options['port'] = 443;
		}
		const req = http.request(options, (res) => {
			res.setEncoding('utf8');
			let rawData = '';
			res.on('data', (chunk) => {
				rawData += chunk;
			});
			res.on('end', () => {
				if (cb) {
					cb(null, rawData);
				}
			});
		});
		req.on('error', (e) => {
			cb(e, null);
			if (_options && _options.error) {
				_options.error(e);
			}
		});
		req.write(post_json_data);
		req.end();
	},
	post_server: function(tk, path, params, cb, _options) {
		const post_data = querystring.stringify(params);
		var headers = {
			"SURI-TOKEN": tk,
			"Content-Type": "application/x-www-form-urlencoded",
			'Content-Length': Buffer.byteLength(post_data)
		};
		var options = URL.parse(helpers.point + path);
		var opt = {
			method: 'POST',
			timeout: 120000,
			insecureHTTPParser: true,
			headers: headers
		};
		helpers.extend(options, opt);
		if (_options && _options.options) {
			helpers.extend(options, _options.options);
		}
		// console.log("post_server options:", options);
		// console.log("post_server post_data:", post_data);
		var client_http_engine = http;
		if (options.protocol.indexOf('https:') >= 0) {
			client_http_engine = https;
			options['port'] = 443;
		}
		const req = http.request(options, (res) => {
			res.setEncoding('utf8');
			let rawData = '';
			res.on('data', (chunk) => {
				rawData += chunk;
			});
			res.on('end', () => {
				if (cb) {
					cb(null, rawData);
				}
			});
		});
		req.on('error', (e) => {
			cb(e, null);
			if (_options && _options.error) {
				_options.error(e);
			}
		});
		req.write(post_data);
		req.end();
	},
	server_get_header: function(dlink, cb, _options) {
		var ua = "netdisk;2.2.2;pc;pc-mac;10.13.6;macbaiduyunguanjia";
		if (_options.hasOwnProperty('ua') && _options.ua) {
			ua = _options.ua;
		}
		var headers = {
			"User-Agent": ua
		};
		const url = new URL.URL(dlink);
		var client_http_engine = http;
		var options = {
			href: url.href,
			origin: url.origin,
			protocol: url.protocol,
			host: url.host,
			hostname: url.hostname,
			path: url.pathname + url.search
		};
		// console.log('options.protocol:',options.protocol);
		if (options.protocol.indexOf('https:') >= 0) {
			client_http_engine = https;
			options['port'] = 443;
		}
		var opt = {
			method: 'HEAD',
			timeout: 120000,
			insecureHTTPParser: true,
			headers: headers
		};
		helpers.extend(options, opt);
		if (_options && _options.options) {
			helpers.extend(options, _options.options);
		}
		// console.log("server_get_header options:", options);
		const req = client_http_engine.request(options, (res) => {

			// console.log('状态码:', res.statusCode);
			cb(null, res.statusCode, res.headers);
			if (res.statusCode == 302) {
				// console.log("location:", res.headers['location'])

			} else {
				// console.log('请求头:', res.headers);
			}
		});
		req.on('error', (e) => {
			cb(e, 0, null);
			if (_options && _options.error) {
				_options.error(e);
			}
		});
		req.end();
	},
	server_get: function(tk, path, params, cb, _options) {
		var headers = {
			"SURI-TOKEN": tk
		};
		const url = new URL.URL(helpers.point + path);
		if (params) {
			for (var k in params) {
				url.searchParams.append(k, params[k]);
			}
		}
		var options = {
			href: url.href,
			origin: url.origin,
			protocol: url.protocol,
			host: url.host,
			hostname: url.hostname,
			path: url.pathname + url.search,
			port: url.port
		};
		var opt = {
			method: 'GET',
			timeout: 120000,
			insecureHTTPParser: true,
			headers: headers
		};
		helpers.extend(options, opt);
		if (_options && _options.options) {
			helpers.extend(options, _options.options);
		}
		var client_http_engine = http;
		if (options.protocol.indexOf('https:') >= 0) {
			client_http_engine = https;
			options['port'] = 443;
		}
		// console.log("server_get options:", options);
		const req = client_http_engine.request(options, (res) => {
			res.setEncoding('utf8');
			let rawData = '';
			res.on('data', (chunk) => {
				rawData += chunk;
			});
			res.on('end', () => {
				if (cb) {
					// console.log('on end rawData:', rawData);
					cb(null, rawData);
				}
			});
		});
		req.on('error', (e) => {
			cb(e, null);
			if (_options && _options.error) {
				_options.error(e);
			}
		});
		req.end();
	},
	check_service: function(points, params, callback) {
		var path = 'open/cfg';
		if (!points || points.length == 0) {
			if (callback) callback(null, null);
			return;
		}
		var opt = {
			method: 'GET',
			timeout: 10000,
			insecureHTTPParser: true
		};
		var final_call = (pos, _point, rawData) => {
			// console.log('check service pos:', pos, ',point:', _point);
			var app_cfg = [];
			if (rawData && rawData.length > 0) {
				app_cfg = JSON.parse(rawData);
			}
			if (callback) {
				callback(_point, app_cfg);
			}
		}
		var to_check = (pos) => {
			if (pos >= points.length) {
				final_call(pos, null, null);
				return;
			}
			var _point = points[pos];
			var url = new URL.URL(_point + path);
			if (params) {
				for (var k in params) {
					url.searchParams.append(k, params[k]);
				}
			}
			var options = {
				href: url.href,
				origin: url.origin,
				protocol: url.protocol,
				host: url.host,
				hostname: url.hostname,
				path: url.pathname + url.search,
				port: url.port
			};
			helpers.extend(options, opt);

			var client_http_engine = http;
			if (options.protocol.indexOf('https:') >= 0) {
				client_http_engine = https;
				options['port'] = 443;
			}
			// console.log('check_service options:', options);
			const req = client_http_engine.request(options, (res) => {
				res.setEncoding('utf8');
				let rawData = '';
				res.on('data', (chunk) => {
					rawData += chunk;
				});
				res.on('end', () => {
					final_call(pos, _point, rawData)
				});
			});
			req.on('error', (e) => {
				Promise.resolve().then(() => {
					to_check(pos + 1);
				});
			});
			req.end();
		};
		to_check(0);
	},
	bd_get: function(point, params, headers, cb, _options) {
		const url = new URL.URL(point);
		if (params) {
			for (var k in params) {
				url.searchParams.append(k, params[k]);
			}
		}
		var options = {
			href: url.href,
			origin: url.origin,
			protocol: url.protocol,
			host: url.host,
			hostname: url.hostname,
			path: url.pathname + url.search,
			port: url.port
		};
		var opt = {
			method: 'GET',
			timeout: 120000,
			insecureHTTPParser: true,
			headers: headers
		};
		helpers.extend(options, opt);
		if (_options && _options.options) {
			helpers.extend(options, _options.options);
		}
		var client_http_engine = http;
		if (options.protocol.indexOf('https:') >= 0) {
			client_http_engine = https;
			options['port'] = 443;
		}
		// console.log("bd_get options:", options);
		const req = client_http_engine.request(options, (res) => {
			res.setEncoding('utf8');
			let rawData = '';
			res.on('data', (chunk) => {
				rawData += chunk;
			});
			res.on('end', () => {
				if (cb) {
					// console.log('on end rawData:', rawData);
					cb(null, rawData);
				}
			});
		});
		req.on('error', (e) => {
			cb(e, null);
			if (_options && _options.error) {
				_options.error(e);
			}
		});
		req.end();
	}
}
module.exports = api;
