const helpers = require("./helper.core.js")
const Base = require("./base.js")
const Dao = require('./dao.js')
const path = require('path');
const fs = require('fs');
const service = require('./service.js');

var app_cfg_db = null;
// new Dao({'type':'list', 'name':'app_cfg',
// 'fields':[{name:"id", type:'VARCHAR', len:20}, 
// 	{name:"name", type:'VARCHAR', len:64},
// 	{name:"val", type:'VARCHAR', len:1024},
// 	{name:"type", type:'VARCHAR', len:10},
// 	{name:"tm", type:'INT'}
// 	]
// }, onInit:function(){

// });
// const CFG_SYNC_DELAY = 8*60*60*1000;
const CFG_SYNC_DELAY = 60 * 60 * 1000;
const CFG_SYNC_TM = 'cfg_sync_tm';
var appcfg = Base.extend({
	constructor: function(download_dir, options) {
		this.points = options && options.points ? options.points : helpers.points;
		this.options = options;
		this.base_dir = download_dir;
		this.core_loading = false;
		this.res_loading = false;
		this.upgrade_task = {
			'libpath': null,
			'size': 0,
			'end': false,
			'st': 0,
			'errmsg': null,
			'err': null
		};
		this.resource_upgrade_task = {
			'libpath': null,
			'size': 0,
			'end': false,
			'st': 0,
			'errmsg': null,
			'err': null
		};
		this.infos = [];
		this.cfg = {};
	},
	random_ua: function() {
		var os_ver = this.get('sysversion');
		var devices = this.cfg.get('devices'); //['pc;pc-mac;10.13.6;macbaiduyunguanjia','pc;macos1;10.13.6;macbaiduyunguanjia','pc;cccone;10.13.6;macbaiduyunguanjia','pc;levis;10.13.6;macbaiduyunguanjia'];
		var ver = '2.2';
		var suf = ~~(Math.random() * 4);
		ver = ver + '.' + suf;
		var devices_idx = ~~(Math.random() * devices.length);
		var ua = "Netdisk;" + ver + ";pc;" + devices[devices_idx] + ";" + os_ver + ";baiduyunguanjia";
		return ua;
	},
	get_ua: function() {
		var platform = this.get('platform');
		var sysversion = this.get('sysversion');
		var netdiskversion = this.get('netdiskversion');
		var ua = "Netdisk;" + netdiskversion + ";pc;" + platform + ";" + sysversion + ";baiduyunguanjia";
		return ua;
	},
	_check_upgrade_task_info: function(t, msg_prefix, complete_msg, callback) {
		// var self = this;
		var msg = null;
		var rs = [];
		var final_call = (rs) => {
			if (callback) {
				callback(rs);
			}
		};
		if (t.st == 1) {
			msg = msg_prefix + "[0.1%]";
			var lib_path = t.libpath;
			var size = t.size;
			if (fs.existsSync(lib_path)) {
				fs.stat(lib_path, (err, stats) => {
					var get_size = stats.size;
					var prog_val = helpers.build_percentage(get_size / 1024, size);
					msg = msg_prefix + "[" + prog_val + "%]";
					rs.push({
						'msg': msg,
						'task': t
					});
					final_call(rs);
				});
			} else {
				rs.push({
					'msg': msg,
					'task': t
				});
				final_call(rs);
			}
		} else if (t.st == 2) {
			msg = null;
			var err = t.err;
			if (err) {
				msg = t.errmsg;
			} else {
				msg = complete_msg;
			}
			rs.push({
				'msg': msg,
				'task': t
			});
			final_call(rs);
		} else {
			final_call(rs);
		}
	},
	check_upgrade_info: function(callback) {
		var self = this;
		var final_call = (rs) => {
			var appver = self.get('appver');
			var appupurl = self.get('appupurl');
			var current_app_versions = self.options.version;
			var merge_msg = (_prefix_msg, _rs) => {
				if (current_app_versions < appver) {
					var prefix_msg = '';
					if (rs.length > 0) {
						prefix_msg = rs[0].msg + '|';
					}
					// var info = rs[0];
					rs[0] = {
						'msg': prefix_msg + '发现新版本App,请通过链接下载更新!',
						'url': appupurl,
						'type': 'a'
					};
				}
				if (rs.length > 0) {
					rs[0].msg = _prefix_msg + '|' + rs[0].msg;
				} else {
					if (_rs) {
						rs = _rs;
					}
				}
				if (callback) {
					callback(rs);
				}
			};
			self._check_upgrade_task_info(self.resource_upgrade_task, '正在下载内核资源,请不要退出应用!', '内核资源下载完成!', (_rs) => {
				if (_rs.length > 0) {
					var _msg = _rs[0].msg;
					merge_msg(_msg, _rs);
				} else {
					merge_msg('', null);
				}
			});

		}
		self._check_upgrade_task_info(self.upgrade_task, '正在下载最新系统UI,请不要退出应用!', "最新系统UI下载完成!", (_rs) => {
			final_call(_rs);
		});
	},
	check_upgrade: function(callback) {
		var self = this;
		self.check_resource_upgrade(()=>{
			console.log('check_resource_upgrade over.');
		});
		var c_dir = this.base_dir;
		var old_ver_val = self.get('old_version');
		var new_ver_val = self.get('version');
		var upurl = self.get('upurl');
		console.log('check_upgrade old_ver_val:', old_ver_val, ',new_ver_val:', new_ver_val, ',upurl:', upurl);
		if (old_ver_val < new_ver_val) {

			if (upurl.substring(upurl.length - 1) != '/') upurl += '/';
			// var lib_name = 'v'+new_ver_val+'.tar.gz';
			var lib_name = 'v' + new_ver_val + '.zip';
			var lib_url = upurl + lib_name;
			console.log('need_to_load new lib!!!!', lib_url);
			var new_core_dir = 'prod';
			var tmp_unzip_dir = path.join(c_dir, 'tmp');
			var new_prod_dir = path.join(c_dir, new_core_dir);
			var new_prod_dir_lib = path.join(c_dir, lib_name);

			var final_call = () => {
				self.infos = [];
				if (callback) {
					callback();
				}
			};
			var final_deal = () => {
				if (fs.existsSync(tmp_unzip_dir)) {
					helpers.remove_dir(tmp_unzip_dir);
				}
				if (!fs.existsSync(tmp_unzip_dir)) {
					fs.mkdirSync(tmp_unzip_dir);
				}
				if (fs.existsSync(new_prod_dir_lib)) {
					//self.update('old_version', new_ver_val, 'old ver');
					helpers.opengzip(new_prod_dir_lib, tmp_unzip_dir, (err, rs) => {
						console.log('opengzip rs:', rs, ',err:', err);
						if (err) {
							fs.unlinkSync(new_prod_dir_lib);
							final_call();
						} else {
							var prod_index_fp = path.join(tmp_unzip_dir, 'prod/index.html');
							if (fs.existsSync(prod_index_fp)) {
								fs.renameSync(path.join(tmp_unzip_dir, 'prod'), new_prod_dir);
								if (fs.existsSync(path.join(new_prod_dir, 'index.html'))) {
									self.update('old_version', new_ver_val, 'old ver');
									fs.unlinkSync(new_prod_dir_lib);
									final_call();
								} else {
									final_call();
								}
							} else {
								final_call();
							}
						}
					});
				} else {
					final_call();
				}
			}
			var ver_obj = self.cfg['version'];
			this.core_loading = true;
			var size = 526;
			var t = ver_obj.type;
			if (t) {
				var _size = parseInt(t);
				if (_size && _size > 0) {
					size = _size;
				}
			}
			self.upgrade_task.st = 1;
			self.upgrade_task.libpath = new_prod_dir_lib;
			self.upgrade_task.size = size;
			self.upgrade_task.errmsg = null;
			self.upgrade_task.err = null;
			service.download_lib_file(new_prod_dir_lib, lib_url, (err, fpath) => {
				console.log('fpath:', fpath);
				if (!err && fpath) {
					if (fs.existsSync(fpath)) {
						//self.update('old_version', new_ver_val, 'old ver');
						console.log('download ok!!!');
						setTimeout(() => {
							final_deal();
						}, 1000);
					} else {
						console.log('can not find lib, ', fpath);
					}
				} else {
					if (fs.existsSync(new_prod_dir_lib)) {
						fs.unlinkSync(new_prod_dir_lib);
					}
					self.upgrade_task.errmsg = 'UI下载失败!';
					self.upgrade_task.err = err;
				}
				self.upgrade_task.st = 2;
				this.core_loading = false;
			});

		} else {
			if (callback) {
				callback();
			}
		}

	},
	check_resource_upgrade: function(callback) {
		var self = this;
		var c_dir = this.base_dir;
		var old_ver_val = self.get('old_resversion');
		var new_ver_val = self.get('resversion');
		var upurl = self.get('resupurl');
		var final_call = () => {
			self.infos = [];
			self.res_loading = false;
			if (callback) {
				callback();
			}
		};
		console.log('check_resource_upgrade old_res_ver_val:', old_ver_val, ',new_res_ver_val:', new_ver_val, ',resupurl:',
			upurl);
		if (old_ver_val < new_ver_val && upurl) {
			if (upurl.substring(upurl.length - 1) != '/') upurl += '/';
			// var lib_name = 'v'+new_ver_val+'.tar.gz';
			var lib_name = 'v' + new_ver_val + '.zip';
			var lib_url = upurl + lib_name;
			console.log('need_to_load new lib!!!!', lib_url);
			var tmp_unzip_dir = path.join(c_dir, 'restmp');
			// if(!fs.existsSync(tmp_unzip_dir)){
			// 	fs.mkdirSync(tmp_unzip_dir);
			// }
			var new_res_dir = path.join(c_dir, 'res');
			if (!fs.existsSync(new_res_dir)) {
				fs.mkdirSync(new_res_dir);
			}
			// var new_prod_dir_lib = path.join(new_res_dir, 'v'+new_ver_val+'.tar.gz');
			var new_prod_dir_lib = path.join(new_res_dir, lib_name);

			var final_deal = () => {
				if (fs.existsSync(tmp_unzip_dir)) {
					helpers.remove_dir(tmp_unzip_dir);
				}
				if (!fs.existsSync(tmp_unzip_dir)) {
					fs.mkdirSync(tmp_unzip_dir);
				}
				if (fs.existsSync(new_prod_dir_lib)) {
					//self.update('old_version', new_ver_val, 'old ver');
					// console.log('will open gzip to:', tmp_unzip_dir);
					helpers.opengzip(new_prod_dir_lib, tmp_unzip_dir, (err, rs) => {
						console.log('opengzip rs:', rs, ',err:', err);
						if (err) {
							fs.unlinkSync(new_prod_dir_lib);
							final_call();
						} else {
							var target_fp = path.join(tmp_unzip_dir, 'res/index.js');
							var target_ori_fp = path.join(tmp_unzip_dir, 'res/');
							console.log('target_fp:', target_fp);
							if (fs.existsSync(target_fp)) {
								var resources_dir = self.get('resources_dir');
								resources_dir = path.join(resources_dir, 'app');
								// console.log('will move file to :', resources_dir);
								process.on('exit', (code) => {
									var f_list = fs.readdirSync(target_ori_fp);
									var src_cmd_list = ['-rf'];
									var src_cmd_list = [];
									f_list.forEach((f, idx)=>{
										src_cmd_list.push(path.join(target_ori_fp, f))
									});
									src_cmd_list.push(resources_dir)
									
									var cp = require('child_process');
									cp.spawnSync('cp', src_cmd_list);
									// src_cmd_list.forEach((s, idx)=>{
									// 	var spawn_cmd = ['-rf', s, resources_dir];
									// 	console.log('cp cmd:', spawn_cmd);
									// 	cp.spawnSync('cp', spawn_cmd);
									// });
									console.log('cp ok!');
								});
								self.update('old_resversion', new_ver_val, 'old ver', ()=>{
									fs.unlinkSync(new_prod_dir_lib);
									final_call();
								});
								// fs.renameSync(path.join(tmp_unzip_dir, 'prod'), new_prod_dir);
								// if(fs.existsSync(path.join(new_prod_dir, 'index.html'))){
								// 	self.update('old_resversion', new_ver_val, 'old ver');
								// 	fs.unlinkSync(new_prod_dir_lib);
								// 	final_call();
								// } else {
								// 	final_call();
								// }
								// fs.unlinkSync(new_prod_dir_lib);
								// final_call();
							} else {
								final_call();
							}
						}

					});
				} else {
					console.log('gzip [' + new_prod_dir_lib + '] file not exists!');
					final_call();
				}
			}
			var download_source_lib = function() {
				service.download_lib_file(new_prod_dir_lib, lib_url, (err, fpath) => {
					console.log('fpath:', fpath);
					if (!err && fpath) {
						if (fs.existsSync(fpath)) {
							var stats = fs.statSync(fpath);
							if (stats.size / 1000 > size * 0.5) {
								console.log('download ok!!!');
							} else {
								fs.unlinkSync(fpath);
							}
							setTimeout(() => {
								final_deal();
							}, 1000);
							//self.update('old_version', new_ver_val, 'old ver');
						} else {
							console.log('can not find lib, ', fpath);
						}
					} else {
						if (fs.existsSync(new_prod_dir_lib)) {
							fs.unlinkSync(new_prod_dir_lib);
						}
						self.resource_upgrade_task.errmsg = 'Res下载失败!';
						self.resource_upgrade_task.err = err;
					}
					self.resource_upgrade_task.st = 2;

				});
			};
			var ver_obj = self.cfg['resversion'];
			this.res_loading = true;
			var size = 16000;
			var t = ver_obj.type;
			if (t) {
				var _size = parseInt(t);
				if (_size && _size > 0) {
					size = _size;
				}
			}
			self.resource_upgrade_task.st = 1;
			self.resource_upgrade_task.libpath = new_prod_dir_lib;
			self.resource_upgrade_task.size = size;
			self.resource_upgrade_task.errmsg = null;
			self.resource_upgrade_task.err = null;
			if (fs.existsSync(new_prod_dir_lib)) {
				var stats = fs.statSync(new_prod_dir_lib);
				if (stats.size / 1000 > size * 0.5) {
					console.log('download ok!!!');
					self.resource_upgrade_task.st = 2;
					final_deal();
				} else {
					fs.unlinkSync(new_prod_dir_lib);
					download_source_lib();
				}
			} else {
				download_source_lib();
			}
		} else {
			final_call();
		}

	},
	_sync: function(callback) {
		var self = this;
		// console.log('更新后丢失!!!!!');
		var v = self.get(CFG_SYNC_TM);
		if (!v) v = 0;
		var final_call = () => {
			if (callback) callback();
		}
		// console.log(CFG_SYNC_TM+' v:', v)
		if (helpers.now() - v > CFG_SYNC_DELAY) {
			self.update(CFG_SYNC_TM, helpers.now(), CFG_SYNC_TM);
			// console.log('will call service! self.points:', self.points);
			//call service
			service.check_service(self.points, {
				'platform': process.platform
			}, (point, app_cfg) => {
				if (point) {
					helpers.point = point;
				}
				// console.log('_sync helpers point:', helpers.point, ',remote app_cfg:', app_cfg);
				if (app_cfg) {
					var next_up = (c, cb) => {
						console.log('update key:', c.key, ',val:', c.val, ',n:', c.name);
						self.update(c.key, c.val, c.name, () => {
							cb(true);
						}, c.type);
					}
					helpers.iterator(app_cfg, (c, idx, cb) => {
						if (c.key == 'version') {
							var old_ver_val = self.get('version');
							if (!old_ver_val) {
								old_ver_val = self.options.version;
								console.log('关键参数 不存在则使用app version, old_ver_val:', old_ver_val);
							}
							if (old_ver_val != c.val) {
								self.update('old_version', old_ver_val, 'old ver', () => {
									//skip
									next_up(c, cb);
								});
							} else {
								next_up(c, cb);
							}
						} else if (c.key == 'resversion') {
							var old_res_ver_val = self.get('resversion');
							if (!old_res_ver_val) {
								old_res_ver_val = self.options.version;
								console.log('关键参数 不存在则使用app version, old_res_ver_val:', old_res_ver_val);
							}
							if (old_res_ver_val != c.val) {
								self.update('old_resversion', old_res_ver_val, 'old res ver', () => {
									//skip
									next_up(c, cb);
								});
							} else {
								next_up(c, cb);
							}
						} else {
							next_up(c, cb);
						}
					}, (iscomplete, idx) => {console.log('iscomplete:', iscomplete, ',idx:', idx);
						final_call();
					});
				} else {
					final_call();
				}
			});
		} else {
			final_call();
		}
	},
	init: function(cb) {
		var self = this;
		var c_dir = this.base_dir;
		var final_call = function() {
			var core_dir = '_prod';
			var new_core_dir = 'prod';
			var tmp_core_dir = '_prod_';
			var prod_dir = path.join(c_dir, core_dir);
			var tmp_prod_dir = path.join(c_dir, tmp_core_dir);
			var new_prod_dir = path.join(c_dir, new_core_dir);
			var prod_index_addr = path.join(prod_dir, '/index.html')
			console.log('prod_dir:', prod_dir);
			if (fs.existsSync(new_prod_dir)) {
				//upgrade core files
				if (fs.existsSync(tmp_prod_dir)) {
					//del tmp_prod_dir
					helpers.remove_dir(tmp_prod_dir);
				}
				if (fs.existsSync(prod_dir)) {
					fs.renameSync(prod_dir, tmp_prod_dir);
				}
				if (fs.existsSync(path.join(new_prod_dir, 'index.html'))) {
					fs.renameSync(new_prod_dir, prod_dir);
				}
			}
			if (fs.existsSync(prod_dir)) {
				if (fs.existsSync(prod_index_addr)) {
					self.update('index', '/_prod/index.html', '');
				}
				if (cb) cb(self);
				setTimeout(()=>{self._sync();},1);
			} else {
				if (cb) cb(self);
				setTimeout(()=>{self._sync();},1);
				// Promise.resolve().then(() => {
				// 	self._sync(
				// 		// ()=>{
				// 		// 	if(cb)cb(self);
				// 		// }
				// 	);
				// });
			}
			// if(cb)cb(self);

		}
		var wheresql = "where 1=1";
		app_cfg_db.query_by_raw_sql(wheresql, (cfg_list) => {
			if (cfg_list) {
				cfg_list.forEach((p, idx) => {
					self.__update(p.id, p.val, p.name, p.tm, p.type);
				});
			}
			final_call();
		});
	},
	update: function(key, val, name, callback, type) {
		var p = this.__update(key, val, name, null, type);
		if (p) {
			app_cfg_db.get('id', key, (_p) => {
				if (_p) {
					app_cfg_db.update_by_id(key, p, () => {
						if (callback) {
							callback(p);
						}
					});
				} else {
					app_cfg_db.put(p, () => {
						if (callback) {
							callback(p);
						}
					});
				}
			});

		} else {
			if (callback) {
				callback(p);
			}
		}
	},
	__update: function(key, val, name, tm, type) {
		var self = this;
		if (!key || val == null) {
			return null;
		}
		if (!(key in self.cfg)) {
			self.cfg[key] = {};
		}
		if (!tm) {
			tm = helpers.now();
		}
		var p = self.cfg[key];
		p['id'] = key;
		p['val'] = val;
		p['tm'] = tm;
		if (type && 'null' !== type) {
			p['type'] = type;
		}
		if (name) {
			p['name'] = name;
		}
		return p;
	},
	get: function(key) {
		if (key in this.cfg) {
			return this.cfg[key]['val'];
		} else if (key in helpers) {
			return helpers[key];
		}
		return null;
	},
	getObj: function(key) {
		if (key in this.cfg) {
			return this.cfg[key];
		}
		return null;
	},
	desc: function(key) {
		if (key in this.cfg) {
			return this.cfg[key]['name']
		}
		return null;
	},
	tostring: function() {
		return JSON.stringify(this.cfg);
	}
});
appcfg.newtable = function(callback) {
	console.log('ready newtable!');
	app_cfg_db = new Dao({
		'type': 'list',
		'name': 'app_cfg',
		'fields': [{
				name: "id",
				type: 'VARCHAR',
				len: 20
			},
			{
				name: "name",
				type: 'VARCHAR',
				len: 64
			},
			{
				name: "val",
				type: 'VARCHAR',
				len: 1024
			},
			{
				name: "type",
				type: 'VARCHAR',
				len: 10
			},
			{
				name: "tm",
				type: 'INT'
			}
		],
		onInited: function() {
			if (callback) {
				callback();
			}
		}
	});
};
module.exports = appcfg;
