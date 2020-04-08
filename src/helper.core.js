const fs = require('fs');
const path = require('path');
// const tar = require('tar');
const compressing = require('compressing');
// const POINT = 'http://192.168.0.102:8080/';
// const POINT = 'http://127.0.0.1:8080/';
const POINT = 'http://111.229.193.232/';
const ERR_CODES_MAP = {
	1: '需要先登录!',
	2: '参数错误!',
	3: '未知错误!'
};
var helpers = {
	point: POINT,
	// point:"https://www.oopsteam.site/",
	points: [POINT, 'https://www.oopsteam.site/', 'http://www.oopsteam.site/', 'http://111.229.193.232:8080/'],
	data_dir_name: ".datas",
	app_data_dir_name: ".oopsteam",
	download_dir_name: "download",
	patch_dir_name: "patch",
	log_dir_name: "logs",
	common_user_agent: 'pan.baidu.com',
	devices: ['pc-mac', 'macos1', 'cccone', 'levis', 'susy', 'win', 'win1'],
	token_timeout: 10 * 24 * 60 * 60 * 1000 + 1,
	min_thread_num: 3,
	build_percentage: function(part_val, total) {
		var s = '' + Math.round((part_val / total) * 1000) / 10;
		if (s.length == 1) {
			s = ' ' + s + '.0';
		} else if (s.length == 2) {
			if (s.indexOf('.') >= 0) {
				s = ' ' + s;
			} else {
				s = s + '.0';
			}
		}
		return s;
	},
	noop: function() {},
	error_codes: function(code) {
		if (code in ERR_CODES_MAP) {
			return ERR_CODES_MAP[code];
		}
		return ERR_CODES_MAP[3];
	},
	scale_size: function(get_size) {
		var bit = 'B';
		var _size = get_size;
		if (_size > 1024) {
			_size = Math.round((_size / 1024) * 10) / 10;
			bit = 'K';
		} else {
			_size = Math.round(_size * 10) / 10;
		}
		if (_size > 1024) {
			_size = Math.round((_size / 1024) * 10) / 10;
			bit = 'M';
		}
		return _size + bit;
	},
	uid: (function() {
		var id = 0;
		return function() {
			return id++;
		};
	}()),
	isNullOrUndef: function(value) {
		return value === null || typeof value === 'undefined';
	},
	isArray: function(value) {
		if (Array.isArray && Array.isArray(value)) {
			return true;
		}
		var type = Object.prototype.toString.call(value);
		if (type.substr(0, 7) === '[object' && type.substr(-6) === 'Array]') {
			return true;
		}
		return false;
	},
	isObject: function(value) {
		return value !== null && Object.prototype.toString.call(value) === '[object Object]';
	},
	isFinite: function(value) {
		return (typeof value === 'number' || value instanceof Number) && isFinite(value);
	},
	valueOrDefault: function(value, defaultValue) {
		return typeof value === 'undefined' ? defaultValue : value;
	},
	valueAtIndexOrDefault: function(value, index, defaultValue) {
		return helpers.valueOrDefault(helpers.isArray(value) ? value[index] : value, defaultValue);
	},
	callback: function(fn, args, thisArg) {
		if (fn && typeof fn.call === 'function') {
			return fn.apply(thisArg, args);
		}
	},
	each: function(loopable, fn, thisArg, reverse) {
		var i, len, keys;
		if (helpers.isArray(loopable)) {
			len = loopable.length;
			if (reverse) {
				for (i = len - 1; i >= 0; i--) {
					fn.call(thisArg, loopable[i], i);
				}
			} else {
				for (i = 0; i < len; i++) {
					fn.call(thisArg, loopable[i], i);
				}
			}
		} else if (helpers.isObject(loopable)) {
			keys = Object.keys(loopable);
			len = keys.length;
			for (i = 0; i < len; i++) {
				fn.call(thisArg, loopable[keys[i]], keys[i]);
			}
		}
	},
	arrayEquals: function(a0, a1) {
		var i, ilen, v0, v1;

		if (!a0 || !a1 || a0.length !== a1.length) {
			return false;
		}

		for (i = 0, ilen = a0.length; i < ilen; ++i) {
			v0 = a0[i];
			v1 = a1[i];

			if (v0 instanceof Array && v1 instanceof Array) {
				if (!helpers.arrayEquals(v0, v1)) {
					return false;
				}
			} else if (v0 !== v1) {
				// NOTE: two different object instances will never be equal: {x:20} != {x:20}
				return false;
			}
		}

		return true;
	},
	clone: function(source) {
		if (helpers.isArray(source)) {
			return source.map(helpers.clone);
		}

		if (helpers.isObject(source)) {
			var target = {};
			var keys = Object.keys(source);
			var klen = keys.length;
			var k = 0;

			for (; k < klen; ++k) {
				target[keys[k]] = helpers.clone(source[keys[k]]);
			}

			return target;
		}

		return source;
	},
	_merger: function(key, target, source, options) {
		var tval = target[key];
		var sval = source[key];

		if (helpers.isObject(tval) && helpers.isObject(sval)) {
			helpers.merge(tval, sval, options);
		} else {
			target[key] = helpers.clone(sval);
		}
	},
	merge: function(target, source, options) {
		var sources = helpers.isArray(source) ? source : [source];
		var ilen = sources.length;
		var merge, i, keys, klen, k;

		if (!helpers.isObject(target)) {
			return target;
		}

		options = options || {};
		merge = options.merger || helpers._merger;

		for (i = 0; i < ilen; ++i) {
			source = sources[i];
			if (!helpers.isObject(source)) {
				continue;
			}

			keys = Object.keys(source);
			for (k = 0, klen = keys.length; k < klen; ++k) {
				merge(keys[k], target, source, options);
			}
		}

		return target;
	},
	mergeIf: function(target, source) {
		return helpers.merge(target, source, {
			merger: helpers._mergerIf
		});
	},
	extend: Object.assign || function(target) {
		return helpers.merge(target, [].slice.call(arguments, 1), {
			merger: function(key, dst, src) {
				dst[key] = src[key];
			}
		});
	},
	inherits: function(extensions) {
		var me = this;
		var BaseElement = (extensions && 'constructor' in extensions) ? extensions.constructor : function() {
			return me.apply(this, arguments);
		};

		var Surrogate = function() {
			this.constructor = BaseElement;
		};

		Surrogate.prototype = me.prototype;
		var sur_inst = new Surrogate();
		BaseElement.prototype = sur_inst;
		BaseElement.extend = helpers.inherits;
		if (extensions) {
			helpers.extend(BaseElement.prototype, extensions);
		}

		BaseElement.__super__ = me.prototype;
		return BaseElement;
	},
	now: function() {
		return Date.now();
	},
	iterator: function(data_list, action, callback) {
		var final_call = (rs, idx) => {
			if (callback && typeof callback.call === 'function') {
				Promise.resolve().then(() => {
					callback(rs, idx);
				});
			}
		};
		if (!data_list || data_list.length == 0) {
			final_call(true, -1);
			return;
		}
		var to_action = (pos) => {
			if (pos >= data_list.length) {
				final_call(true, pos);
				return;
			}
			var item = data_list[pos];
			if (action && typeof action.call === 'function') {
				Promise.resolve().then(() => {
					action(item, pos, (comeon) => {
						if (comeon) {
							to_action(pos + 1);
						} else {
							final_call(pos == data_list.length - 1, pos);
						}
					});
				});
			} else {
				final_call(false, -2);
			}
		};
		to_action(0);
	},
	check_json_result: function(result, callback) {
		if ("result" in result) {
			var rs = result["result"]
			if (rs == "fail") {
				if ("state" in result) {
					if (callback) {
						callback(result["state"]);
					}
					return result["state"]
				} else {
					if (callback) {
						callback(-9);
					}
					return -9;
				}
			}
		}
		return 1;
	},
	looper: (function() {
		var _t = null;
		var _all_listeners = {};
		var raf_tm = 0;
		var raf = null;
		var caf = null;
		var clearRunningProcess = function() {
			if (raf) {
				if (_t && caf) caf(_t);
			} else {
				if (_t) clearTimeout(_t);
			}
		};
		if (caf) {
			console.log('use requestAnimationFrame!!!!!!!!!!!!!!!');
		}
		var delayRun = function(fn, delay) {
			clearRunningProcess();
			if (raf) {
				raf_tm = Date.now();
				var animation = function(){
					_t = raf(function() {
						if (Date.now() - raf_tm >= delay) {
							fn();
						} else {
							animation();
						}
					})
				}
				if (_looper.running) {
					animation();
				}
			} else {
				if (_looper.running) {
					_t = setTimeout(fn, delay);
				}
			}
		}

		function runner() {
			var will_del = [];
			for (var uid in _all_listeners) {
				var cb = _all_listeners[uid][0];
				var _params = _all_listeners[uid][1];
				if (cb(_params)) {
					will_del.push(uid);
				}
			}
			for (var i = 0; i < will_del.length; i++) {
				delete _all_listeners[will_del[i]];
			}
			if (_looper.running) {
				delayRun(runner, 1000);
			}
		}
		var _looper = {
			running: false,
			stop: function() {
				_looper.running = false;
				clearRunningProcess();
				_t = null;
			},
			start: function() {
				if (!_looper.running) {
					_looper.running = true;
					delayRun(runner, 1000);
				}
			},
			removeListener: function(uid) {
				if (uid in _all_listeners) {
					delete _all_listeners[uid];
				}
			},
			addListener: function(uid, callback, params) {
				_all_listeners[uid] = [callback, params];
			}
		};
		return _looper;
	})(),
	remove_dir: function(dir_path) {
		var files = [];
		if (fs.existsSync(dir_path)) {
			files = fs.readdirSync(dir_path);
			files.forEach((file, idx) => {
				var cpath = path.join(dir_path, file);
				if (fs.statSync(cpath).isDirectory()) {
					helpers.remove_dir(cpath);
				} else {
					fs.unlinkSync(cpath);
				}
			});
			fs.rmdirSync(dir_path);
		}
	},
	append_merge_files: function(files, final_file, callback) {
		// var _files = JSON.parse(JSON.stringify(files));
		if (files.length == 1) {
			fs.rename(files[0], final_file, (err) => {
				callback(err);
			});
			return;
		}
		if (files.length == 0) {
			return;
		}
		var target_fs = fs.createWriteStream(final_file);

		function cb() {
			if (!files.length) {
				target_fs.end();
				callback(null);
				return;
			}
			var stream = fs.createReadStream(files.shift());
			stream.pipe(target_fs, {
				end: false
			});
			stream.on("end", function() {
				cb();
			});
		}
		cb();
	},
	file_rename: function(origin_file_path, new_file_path, on_exists_bak, cb) {
		if (fs.existsSync(origin_file_path)) {
			if (fs.existsSync(new_file_path)) {
				if (on_exists_bak) {
					var bak_suffix = on_exists_bak();
					if (bak_suffix) {
						var bak_path = path.join(new_file_path, bak_suffix);
						helpers.file_rename(new_file_path, bak_path);
					} else {
						fs.unlinkSync(new_file_path);
					}
				} else {
					fs.unlinkSync(new_file_path);
				}
			}
			fs.rename(origin_file_path, new_file_path, (err) => {
				if (err) {
					throw err;
				}
				if (cb) {
					cb();
				}
			});
		} else {
			throw "[" + origin_file_path + "] not exists!";
		}
	},
	copy_files_skip_size: function(files, final_file, skip, callback) {
		var self = this;
		if (files.length == 0) {
			return;
		}
		var start_pos = 0,
			end_pos = 0;
		if (skip > 0) {
			var l = 0;
			files.forEach((f, idx) => {
				if (fs.existsSync(f)) {
					var stat = fs.statSync(f);
					l += stat.size;
				}
			});
			end_pos = l - skip - 1;
		}
		self.copy_files_by_range(files, final_file, start_pos, end_pos, callback);
	},
	copy_files_by_range: function(files, final_file, start, end, callback) {
		if (files.length == 0) {
			if (callback) callback();
			return;
		}
		var _s = start,
			_e = end;
		var _f_options = {};
		var _files = [];
		var l = 0;
		files.forEach((f, idx) => {
			_f_options[f] = {};
			var need_push = true;
			var stat = fs.statSync(f);
			var _f_size = stat.size;
			if (_s > 0) {
				if (stat.size > _s) {
					_f_options[f]['start'] = _s;
					_s = 0;
					_files.push(f);
					_f_size = stat.size - _s;
				} else {
					_f_size = 0;
					_s -= stat.size;
					need_push = false;
				}
			}
			if (_e > 0) {
				if (l + stat.size - 1 <= _e) {
					l += stat.size;
				} else {
					var skip_end = l + stat.size - 1 - _e;
					if (skip_end > 0) {
						_f_options[f]['end'] = stat.size - skip_end - 1;
						l = _e + 1;
					} else {
						need_push = false;
					}
				}
			}
			if (need_push) {
				_files.push(f);
			}
		});
		var target_fs = fs.createWriteStream(final_file);
		var pos = 0;
		var read_stream_options = {
			start: 0
		};

		function cb() {
			if (!_files.length) {
				target_fs.end();
				if (callback) callback();
				return;
			}
			var ori_file = _files.shift();
			if (ori_file in _f_options) {
				var _f_opt = _f_options[ori_file];
				helpers.extend(read_stream_options, _f_opt);
				console.log('new stream_options:', read_stream_options);
			}
			var stream = fs.createReadStream(ori_file, read_stream_options);
			stream.pipe(target_fs, {
				end: false
			});
			stream.on("end", function() {
				cb();
			});
		}
		cb();
	},
	opengzip: function(zippath, target_dir, callback) {
		console.log('opengzip:', zippath, ',to target_dir:', target_dir);
		compressing.zip.uncompress(zippath, target_dir).then(() => {
			callback(null, 'ok');
		}).catch((err) => {
			callback(err, null);
		});

		// tar.x({
		// 	file: zippath,
		// 	onwarn:function(code, msg, data){console.warn(code+":"+msg); callback(code, msg)},
		//   strip: 0,
		//   C: target_dir // alias for cwd:'some-dir', also ok
		// }).then(()=>{callback(null, 'ok')});

	}
};
module.exports = helpers;
