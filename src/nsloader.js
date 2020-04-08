const {
	dialog
} = require('electron');
const helpers = require("./helper.core.js")
const Base = require("./base.js")
const Dao = require('./dao.js')
const request = require('request');
const service = require('./service.js')
// const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const created_at_field = {
	name: "created_at",
	type: 'CHAR',
	len: 19
};
const updated_at_field = {
	name: "updated_at",
	type: 'CHAR',
	len: 19
};
const char_id_field = {
	name: "id",
	type: 'VARCHAR',
	len: 20
};
const fs_id_field = {
	name: "fs_id",
	type: 'VARCHAR',
	len: 20
};
const path_field = {
	name: "path",
	type: 'VARCHAR',
	len: 1024
};
const item_id_field = {
	name: "item_id",
	type: 'VARCHAR',
	len: 16
};
const md5_val_field = {
	name: "md5_val",
	type: 'VARCHAR',
	len: 64
};

var download_loader_db = new Dao({
	'type': 'list',
	'name': 'token_loader',
	'fields': [char_id_field, created_at_field,
		updated_at_field, fs_id_field, md5_val_field,
		{
			name: "share_log_id",
			type: 'INT'
		},
		path_field,
		{
			name: "size",
			type: 'INT'
		}, {
			name: "category",
			type: 'INT'
		},
		{
			name: "pin",
			type: 'INT'
		},
		{
			name: "rdlink",
			type: 'VARCHAR',
			len: 1024
		},
		{
			name: "content_type",
			type: 'VARCHAR',
			len: 32
		},
		{
			name: "dlink",
			type: 'VARCHAR',
			len: 1024
		}, {
			name: "filename",
			type: 'VARCHAR',
			len: 512
		},
		{
			name: "expired_at",
			type: 'CHAR',
			len: 19
		}, {
			name: "pan_account_id",
			type: 'INT'
		},
		{
			name: "transfer_log_id",
			type: 'INT'
		},
		{
			name: "source_id",
			type: 'VARCHAR',
			len: 20,
			index: true
		},
		{
			name: "used",
			type: 'INT'
		}
	]
});
var download_task_db = new Dao({
	'type': 'list',
	'name': 'tasks',
	'fields': [char_id_field, item_id_field, md5_val_field,
		{
			name: "state",
			type: 'INT',
			index: true
		},
		{
			name: "filename",
			type: 'VARCHAR',
			len: 512
		},
		{
			name: "total_length",
			type: 'INT'
		},
		{
			name: "type",
			type: 'VARCHAR',
			len: 10
		},
		{
			name: "fuzzy_id",
			type: 'VARCHAR',
			len: 64
		},
		{
			name: "source",
			type: 'VARCHAR',
			len: 20,
			index: true
		},
		{
			name: "tm",
			type: 'INT'
		}
	]
});
var download_sub_task_db = new Dao({
	'type': 'list',
	'name': 'sub_tasks',
	'fields': [{
			name: "id",
			type: 'VARCHAR',
			len: 40
		},
		{
			name: "source_id",
			type: 'VARCHAR',
			len: 20
		},
		{
			name: "start",
			type: 'INT'
		},
		{
			name: "end",
			type: 'INT'
		},
		{
			name: "over",
			type: 'INT'
		},
		{
			name: "idx",
			type: 'INT'
		},
		{
			name: "loader_id",
			type: 'VARCHAR',
			len: 20
		},
		{
			name: "state",
			type: 'INT'
		},
		{
			name: "get_size",
			type: 'INT'
		},
		{
			name: "exhaust",
			type: 'VARCHAR',
			len: 10
		},
		{
			name: "speed",
			type: 'VARCHAR',
			len: 10
		},
		{
			name: "drain",
			type: 'INT'
		},
		{
			name: "tm",
			type: 'INT'
		}
	]
});

function call_pansite_by_post(tk, point, _path, params, callback) {
	var ithis = this;
	var headers = {
		"SURI-TOKEN": tk,
		"Content-Type": "application/x-www-form-urlencoded"
	};
	var data = JSON.stringify(params);
	// console.log("call_pansite_by_post params:", params);
	var options = {
		method: 'POST',
		url: point + _path,
		followRedirect: false,
		followOriginalHttpMethod: true,
		timeout: 120000,
		strictSSL: false,
		form: params,
		headers: headers
	};
	request(options, function(error, response, body) {
		// console.log("body:", body)
		var json_obj = JSON.parse(body);
		if (!json_obj) {
			callback({
				"state": -1,
				"msg": "ready fail!"
			})
			return;
		}
		callback(json_obj)
	})
}

var build_download_loader = function(datas, callback) {
	var self = this;
	var cnt = 0;
	var loader_list = [];
	var final_call = () => {
		callback();
	};
	var parse_subs = function() {

		if (datas.hasOwnProperty("subs")) {
			var subs = datas['subs'];
			// thread_count += subs.length;
			var re_call_save_loader = (pos) => {
				if (pos >= subs.length) {
					final_call();
					return;
				}
				var sub_loader = subs[pos];
				console.log('sub_loader:', sub_loader);
				var transfer_log_id = sub_loader['id'];
				sub_loader['id'] = sub_loader['fs_id'];
				sub_loader['transfer_log_id'] = transfer_log_id;
				sub_loader['source_id'] = self.task.id;
				sub_loader['used'] = 0;
				sub_loader['rdlink'] = '';
				sub_loader['pin'] = 0;
				download_loader_db.get('id', sub_loader['id'], (_item) => {
					if (_item) {
						download_loader_db.update_by_id(sub_loader['id'], sub_loader, () => {
							re_call_save_loader(pos + 1);
						});
					} else {
						download_loader_db.put(sub_loader, () => {
							re_call_save_loader(pos + 1);
						});
					}
				});
			};
			re_call_save_loader(0);
		} else {
			final_call();
		}
	}
	if (datas.hasOwnProperty("master")) {
		cnt += 1;
		var master = datas['master'];
		loader_list.push(master)
		var share_log_id = master['id'];
		master['id'] = master['fs_id'];
		master['share_log_id'] = share_log_id;
		master['source_id'] = this.task.id;
		master['rdlink'] = '';
		master['pin'] = 0;
		master['used'] = 0;
		console.log("source_id:", master['source_id']);
		download_loader_db.get('id', master['id'], (item) => {
			if (item) {
				download_loader_db.update_by_id(master['id'], master, () => {
					parse_subs();
				});
			} else {
				download_loader_db.put(master, () => {
					parse_subs();
				});
			}
		});
	} else {
		parse_subs();
	}

}
const section_max_size = 5 * 1024 * 1024;
const section_min_size = 2 * 1024 * 1024;
const section_mini_min_size = 64 * 1024;
const max_idle_cnt = 30;
const max_counter = 8;
const min_counter = 3;
const tasker_retry_max = 3;
var exclude_ua_map = {};
////////////////////////////////////////////////NS SUB TASK CLASS
var nsSubTask = Base.extend({
	constructor: function(params, options) {
		if (options) {
			this.nstask = options.context;
			if (this.nstask) {
				this.nsloader = this.nstask.nsloader;
				this.point = this.nstask.point;
			}
		}
		this.params = params;
		this.state_change = null;
		this.last_get_size = 0;
		this.counter = 0;
		this.retry = 0;
		this.ua = "";
		this.exhaust = '';
		this.speed = '0B';
		this.save(() => {
			if (options.onReady) {
				options.onReady(this);
			}
		});
	},
	save: function(cb) {
		var self = this;
		// console.log("sub task will save:", this.params['id']);
		download_sub_task_db.get('id', this.params['id'], (_task) => {
			if (_task) {
				var start_at = self.params['start'];
				var end_at = self.params['end'];
				if (_task['start'] == start_at && _task['end'] == end_at) {
					if (cb) {
						cb();
					}
				} else {
					this.params['id'] = this.params['id'] + '_0';
					download_sub_task_db.put(self.params, cb);
				}
			} else {
				download_sub_task_db.put(self.params, cb);
			}
		});
	},
	get_state: function() {
		return this.params['state'];
	},
	is_loading: function() {
		return this.get_state() == 1;
	},
	update_state: function(state, cb) {
		var ithis = this;
		this.params['state'] = state;
		download_sub_task_db.update_by_id(this.params['id'], {
			'state': state
		}, (_id, _params) => {
			if (ithis.state_change) {
				ithis.state_change();
			}
			if (cb) {
				cb();
			}
		});

	},
	update_pos: function(start, end, cb) {
		this.params['start'] = start;
		this.params['end'] = end;
		console.log('update_pos start:', start, ',end:', end);
		download_sub_task_db.update_by_id(this.params['id'], {
			'start': start,
			'end': end
		}, (_id, _params) => {
			if (cb) {
				cb();
			}
		});
	},
	del: function(cb) {
		var ithis = this;
		download_sub_task_db.del('id', this.params['id'], () => {
			console.log("sub task [" + ithis.params['id'] + "] del ok!");
			if (cb) {
				cb();
			}
		});
	},
	size: function() {
		return this.params.end - this.params.start;
	},
	cache_file_exist: function() {
		var fn = this.params.id;
		var file_path = path.join(this.nstask.download_file_path, fn);
		if (fs.existsSync(file_path)) {
			var states = fs.statSync(file_path);
			return states.size > 0;
		} else {
			return false;
		}
	},
	cache_file_exist: function() {
		var fn = this.params.id;
		var file_path = path.join(this.nstask.download_file_path, fn);
		if (fs.existsSync(file_path)) {
			var states = fs.statSync(file_path);
			return states.size > 0;
		} else {
			return false;
		}
	},
	fs_file_size: function() {
		var fn = this.params.id;
		var file_path = path.join(this.nstask.download_file_path, fn);
		if (fs.existsSync(file_path)) {
			var states = fs.statSync(file_path);
			return states.size;
		}
		return null;
	},
	cache_file_exist: function() {
		var fn = this.params.id;
		var file_path = path.join(this.nstask.download_file_path, fn);
		if (fs.existsSync(file_path)) {
			var states = fs.statSync(file_path);
			return states.size > 0;
		} else {
			return false;
		}
	},
	fs_file_size: function() {
		var fn = this.params.id;
		var file_path = path.join(this.nstask.download_file_path, fn);
		if (fs.existsSync(file_path)) {
			var states = fs.statSync(file_path);
			return states.size;
		}
		return null;
	},
	check_file_size: function() {
		var params = this.params
		var fn = this.params.id;
		var file_path = path.join(this.nstask.download_file_path, fn);
		// console.log('check_file_size file_path:', file_path);
		if (fs.existsSync(file_path)) {
			if (this.size() == 0 && this.get_state() != 1) {
				fs.unlinkSync(file_path);
				this.last_get_size = 0;
				return 0;
			}
			var states = fs.statSync(file_path);
			if (this.size() > states.size && this.get_state() != 1) {
				if (this.get_state() == 2) {
					this.update_state(3);
				}
			} else if (this.size() < states.size && this.get_state() != 1) {
				if (this.get_state() == 2) {
					this.update_state(3);
				}
				fs.unlinkSync(file_path);
				this.last_get_size = 0;
				return 0;
			}
			if (this.last_get_size == 0) {
				this.last_get_size = states.size;
			} else {
				this.counter = this.counter + 1;
				if (this.counter >= max_counter) {
					this.last_get_size = states.size;
					this.counter = 0;
				} else if (states.size > this.last_get_size) {
					if (this.counter >= min_counter) {
						var real_speed = (states.size - this.last_get_size) / this.counter;
						this.params['exhaust'] = 0;
						if (real_speed > 0) {
							var exhaust = Math.round((this.size() - states.size) / real_speed) + 'S';
							if (exhaust > 0) {
								this.params['exhaust'] = exhaust;
							}
						}
						var speed = helpers.scale_size(real_speed);
						this.params['speed'] = speed;
					}
				}
			}
			this.params['get_size'] = states.size;
			return states.size;
		} else {
			if (this.size() == 0 && this.get_state() != 2) {
				this.update_state(2);
			}
		}
		this.last_get_size = 0;
		return 0;
	},
	try_close_pipe: function() {
		if (this.pipe) {
			try {
				this.pipe.end();
			} catch (e) {
				console.error("try_close_pipe:", e);
			}
			this.pipe = null;
			if ([0, 1].indexOf(this.get_state()) >= 0) {
				this.update_state(3);
			}
		}
	},
	check_req_stream_file: function(file_path, callback) {
		setTimeout(() => {
			if (fs.existsSync(file_path)) {
				var states = fs.statSync(file_path);
				var f_size = states.size;
				if (f_size == 0) {
					var rs = {
						'error_code': 9999,
						'error_msg': 'nothing in this file[' + file_path + ']!'
					};
					if (callback) {
						callback(rs);
					}
					return rs;
				}
				var rm_fs = function() {
					try {
						fs.unlinkSync(file_path);
					} catch (e) {
						console.error(e);
					}
				};
				if (this.size() > f_size) {
					rm_fs();
					var rs = {
						'error_code': 9999,
						'error_msg': 'datas is not enough, in this file[' + file_path + ']!'
					};
					if (callback) {
						callback(rs);
					}
					return rs
				} else {
					if (callback) {
						callback(null);
					}
				}
			} else {
				if (callback) {
					callback(null);
				}
			}
		}, 1000);

	},
	ready_emit_loader_thread: function(cb) {
		var self = this;
		var params = this.params;
		var fn = params['id'];
		var file_path = path.join(self.nstask.download_file_path, fn);
		if (params['loader_id'] == 0) {
			console.log('下载任务参数异常,稍后重试:', params);
			self.nstask.check_next_task(file_path);
			if (cb) {
				cb();
			}
			return;
		}
		this.nstask.get_loader_by_id(params['loader_id'], (l) => {
			// console.log('ready_emit_loader_thread loader:', l.id, ", sub task:", fn);
			// console.log('ready_emit_loader_thread sub task params:', params);
			download_loader_db.update_by_id(l.id, {
				'pin': 1
			}, (id, params) => {
				self.emit_loader_thread(l, () => {
					if (cb) {
						cb();
					}
				});
			});
		});

	},
	put_exclude_ua: function(loader) {
		var ithis = this;
		var url = loader.dlink;
		if (!exclude_ua_map.hasOwnProperty(url)) {
			exclude_ua_map[url] = [ithis.ua];
		} else {
			var ex_ua_list = exclude_ua_map[url];
			if (ex_ua_list.indexOf(ithis.ua) < 0) {
				ex_ua_list.push(ithis.ua);
			}
		}
	},
	get_ua: function(loader) {
		var ithis = this;
		/*
		var url = loader.dlink;
		ithis.ua = ithis.nsloader.cfg.get('common_user_agent');
		if(exclude_ua_map.hasOwnProperty(url)){
			var ex_ua_list = exclude_ua_map[url];
			if(ex_ua_list.indexOf(ithis.ua)<0){
				return ithis.ua;
			}
		} else {
			return ithis.ua;
		}
		*/
		var ua = this.nsloader.random_ua();
		ithis.ua = ua;
		return ua;
	},
	emit_loader_thread: function(loader, next_cb) {
		var ithis = this;
		var self = this;
		var params = this.params;
		if ([2, 7].indexOf(ithis.get_state()) >= 0) {
			console.log('下载任务不符合下载状态:', params);
			if (next_cb) next_cb();
			return;
		}
		if (this.size() == 0) {
			console.log('下载任务Size不符合下载状态:', params);
			ithis.check_file_size();
			if (next_cb) next_cb();
			return;
		}
		var is_patch = params.hasOwnProperty('patch') ? params.patch == 1 : false;
		// var loader = this.loader_context.cfl.get_loader_by_id(params['loader_id']);
		var url = loader.rdlink;
		if (!url) url = loader.dlink;
		var fn = params['id'];
		var start = params['start'];
		var end = params['end'];
		var headers = {
			"User-Agent": ithis.get_ua(loader)
		};
		headers["Range"] = "bytes=" + start + "-" + (end - 1);
		var file_path = path.join(this.nstask.download_file_path, fn);
		console.log("fetch headers:", headers);
		var stream = fs.createWriteStream(file_path);
		stream.on('drain', function(e) {
			params['drain'] = helpers.now();
			return true;
		});
		// console.log('url:', url, headers.Range);
		this.update_state(1, () => {
			if (next_cb) next_cb();
		});
		var options = {
			method: 'GET',
			url: url,
			timeout: 50000,
			strictSSL: false,
			headers: headers
		};
		var check_rs_by_check_rs = (check_rs) => {
			ithis.update_state(4, () => {
				if (check_rs.hasOwnProperty('error_code')) {
					console.log('error_code:', check_rs.error_code);
					if (31045 == check_rs.error_code) {
						if (ithis.retry >= tasker_retry_max) {
							ithis.retry = 0;
							download_loader_db.update_by_conditions_increment({
								'id': loader.id
							}, {
								'pin': 3
							}, {
								'used': -1
							}, () => {
								loader.used -= 1;
								download_sub_task_db.update_by_id(ithis.params['id'], {
									'loader_id': 0
								}, () => {
									ithis.params['loader_id'] = 0;
									ithis.update_state(3, () => {
										ithis.recheck_loader(loader, () => {
											final_call(3);
										});

									});
								});
							});
							return;
						}
					} else if ([31626, 31360].indexOf(check_rs.error_code) >= 0) {
						//check dlink,无须重试,直接等待重新分配loader
						console.log('error_code[31626,31360](' + loader.id + '):', check_rs);
						ithis.put_exclude_ua(loader);
						var new_loader_pin = 0;
						download_loader_db.update_by_conditions_increment({
							'id': loader.id
						}, {
							'pin': new_loader_pin
						}, {
							'used': -1
						}, () => {
							download_sub_task_db.update_by_id(ithis.params['id'], {
								'loader_id': 0
							}, () => {
								ithis.params['loader_id'] = 0;
								ithis.update_state(3, () => {
									ithis.recheck_loader(loader, () => {
										final_call(3);
									});

								});
							});
						});
						return;
					}
					if (ithis.retry < tasker_retry_max) {
						ithis.retry += 1;
						setTimeout(() => {
							ithis.emit_loader_thread(loader);
						}, 10000);
					} else {
						download_loader_db.update_by_conditions_increment({
							'id': loader.id
						}, {
							'pin': 0
						}, {
							'used': -1
						}, () => {
							console.log("error 文件[" + fn + "]下载失败!", check_rs);
							// ithis.update_state(3,()=>{
							// 	final_call(3);
							// });
							setTimeout(() => {
								ithis.update_state(3, () => {
									final_call(3);
								});
							}, 5000);
						});
					}
				} else {
					// final_call();
					// console.log("error 文件["+fn+"]下载失败!", check_rs);
					download_loader_db.update_by_conditions_increment({
						'id': loader.id
					}, {
						'pin': 0
					}, {
						'used': -1
					}, () => {
						console.log("error 文件[" + fn + "]下载失败!", check_rs);
						setTimeout(() => {
							ithis.update_state(3, () => {
								final_call(3);
							});
						}, 5000);
					});
				}
			});
		};
		this.try_close_pipe();
		try {
			// console.log('will request url:', url);
			var rq = request(options);
			this.pipe = rq.pipe(stream);
			this.pipe.on("close", function() {
				console.log("文件[" + fn + "] on close ===>:", fn);
				params['over'] = 1;
				params['tm'] = helpers.now();
				stream.end();
			});
			rq.on("error", function(err) {
				console.log("rq error 文件[" + fn + "]下载失败!===>", err);
				// params['over'] = 1;
				params['tm'] = helpers.now();
				// ithis.update_state(4);
				ithis.put_exclude_ua(loader);
				recover_loader_state_by_err(() => {
					final_call(3)
				});
			}).on("timeout", function() {
				console.log("rq error 文件[" + fn + "]下载超时失败!");
				// ithis.update_state(5);
				recover_loader_state_by_err(() => {
					final_call(3)
				});
			}).on("aborted", function() {
				console.log("rq error 文件[" + fn + "]下载被中断失败!");
				// ithis.update_state(5);
				recover_loader_state_by_err(() => {
					final_call(3)
				});
			}).on("response", (res) => {
				if (res) {
					res.on('end', () => {
						console.log('文件[' + fn + '] on end complete?:', res.complete);
						ithis.check_req_stream_file(file_path, (check_rs) => {
							if (!res.complete) {
								if (check_rs) {
									check_rs_by_check_rs(check_rs);
								} else {
									recover_loader_state_by_err(() => {
										final_call(3)
									});
								}
							} else {
								console.log('complete check_rs:', check_rs);
								if (check_rs) {
									check_rs_by_check_rs(check_rs);
								} else {
									// setTimeout(()=>{

									// },200);
									var __size = 0;
									if (fs.existsSync(file_path)) {
										var states = fs.statSync(file_path);
										__size = states.size;
									}
									console.log('fn:', fn, ',total:', ithis.size(), ',f size:', __size);
									if (ithis.size() == __size) {
										recover_loader_state_by_success();
									} else {
										recover_loader_state_by_err(() => {
											final_call(3)
										});
									}
								}
							}
						});
					});
				}
			});
		} catch (e) {
			params['over'] = 1;
			params['tm'] = helpers.now();
			console.error("e:", e);
			try {
				stream.end();
			} catch (e0) {
				console.error("e0:", e0)
			}
			recover_loader_state_by_err(() => {
				final_call(3)
			});
		}
		var recover_loader_state_by_err = (cb) => {
			download_loader_db.update_by_conditions_increment({
				'id': loader.id
			}, {
				'pin': 0
			}, {
				'used': -1
			}, () => {
				ithis.update_state(3, cb);
			})
		};
		var recover_loader_state_by_success = () => {
			download_loader_db.update_by_conditions_increment({
				'id': loader.id
			}, {
				'pin': 0
			}, {
				'used': 1
			}, () => {
				loader.used += 1;
				if (ithis.get_state() != 3 && ithis.get_state() != 2) {
					console.log('sub tast update state to 2.');
					ithis.update_state(2, () => {
						final_call(2);
					});
				} else {
					setTimeout(() => {
						var fs_size = ithis.fs_file_size();
						if (fs_size && ithis.size() == fs_size) {
							console.log('出现未知情况,状态为' + ithis.get_state() + '.但size相同,故强制状态为2,继续执行.');
							if (ithis.get_state() == 3) {
								ithis.update_state(2, () => {
									final_call(2);
								});
							} else {
								final_call(2);
							}
						} else {
							console.log('出现未知情况,状态为:' + ithis.get_state());
							final_call(3);
						}
					}, 300);
				}
			});
		};
		var final_call = function(st) {
			if (!ithis.nstask.is_loading()) {
				console.log('final_call task is not loading:', ithis.nstask.task.id);
				return;
			}
			if (is_patch) {
				console.log('this is patched sub task, maybe stop here!');
				ithis.nstask.checkout_loader_list((loader_list) => {
					var is_r = ithis.nstask.check_sub_tasks_running();
					console.log("loader_list len:", loader_list.length, ", is_r:", is_r);
					var running_cnt = self.nstask.check_sub_task_loading_count();
					var min_thread_num = ithis.nsloader.cfg.get('min_thread_num');
					if (min_thread_num - running_cnt > 0) {
						ithis.nstask.check_next_task(file_path);
					} else {
						console.log('this is patched sub task, maybe stop here!');
					}
				});
				return;
			}
			if (!ithis.nstask.check_next_task(file_path)) {
				console.log('will retry final call!,', params);
				setTimeout(final_call, 1000);
			} else {
				console.log('final call, source state:', st);
			}
		};
	},
	compute_progress: function() {
		var self = this;
		var f_size = this.check_file_size();
		var exhaust = this.params['exhaust'];
		if (exhaust) {
			self.exhaust = exhaust;
		}
		var start = this.params['start'];
		var speed = this.params['speed'];
		if (speed) self.speed = speed;

		var get_size = this.params['get_size'];
		if (!get_size) get_size = 0;
		var s = this.size();
		var r = 0;
		if (s > 0) {
			r = helpers.build_percentage(get_size, s);
		}
		var prog_val = r;
		if (prog_val > 100) prog_val = 100;
		return {
			'prog_val': prog_val,
			'exhaust': self.exhaust,
			'speed': self.speed,
			'get_size': get_size,
			'id': this.params['id'],
			'start': start
		};
	}
});
////////////////////////////////////////////////NS TASK CLASS
var nstask = Base.extend({
	constructor: function(task, options) {
		if (options) {
			this.nsloader = options.context;
			this.point = this.nsloader.point;
		}
		this.tasks = [];
		this.sub_task_map = {};
		this.task = task;
		this.check_tasks_events = [];
		this.checking_next_task = false;
		this.arrange_sub_task_list_running = false;
		this.loaders = [];
		this.emit_tag = null;
		this.counter = 0;
		this.total_seconds = 0;
		this.last_get_size = 0;
		this.exhaust = '';
		this.speed = '0B';
		this.section_min_size = section_min_size;
		this.section_max_size = section_max_size;
		this.need_clear_task_list = [];
		this.download_file_path = path.join(this.nsloader.download_dir, '' + this.task.id)
		// console.log('this.task:', this.task);
		if (options && options.onReady) {
			options.onReady(this);
		}
	},
	query_tasker_list_from_local: function(source_id, cb) {
		// console.log('query sub task, source_id:', source_id);
		download_sub_task_db.query('source_id', source_id, (rows) => {
			cb(rows);
		});
	},
	active_tasks: function(callback) {
		var ithis = this;
		var item = ithis.task;
		console.log('active_tasks task:', ithis.task);
		if (!fs.existsSync(ithis.download_file_path)) {
			fs.mkdirSync(ithis.download_file_path);
		}
		var loader_list = this.loaders;
		var page_count = loader_list.length;
		if (page_count == 0) {
			console.log('没有可用的loader!');
			return;
		}
		var min_thread_num = ithis.nsloader.cfg.get('min_thread_num');
		if (page_count < min_thread_num) {
			page_count = min_thread_num;
		}

		var query_file_head_callback = function(url, params) {
			if (url == null && params['info']) {
				// this.nsloader.send()
				// console.log('info:',params['info']);
				ithis.nsloader.send({
					'tag': 'alert',
					'msg': params['info']
				});
				return;
			}
			var l = params['length'];
			if (l < ithis.section_max_size && l > section_mini_min_size) {
				ithis.section_max_size = section_mini_min_size * 4;
				ithis.section_min_size = section_mini_min_size * 2;
			}
			ithis.update_task('total_length', l);
			item['total_length'] = l;
			item['download'] = 0;
			while (page_count > 1 && l / page_count < ithis.section_min_size) {
				page_count = page_count - 1;
			}
			console.log('page_count:', page_count);
			item['tasks'] = [];
			var page_size = Math.round(l / page_count);
			if (page_size > ithis.section_max_size) {
				page_size = ithis.section_max_size;
			}
			helpers.iterator(loader_list, (l, idx, cb) => {
				ithis._update_rdlink(l, () => {
					cb(true);
				});
			}, (rs, idx) => {
				build_sub_task();
			});
			console.log('loader_list size:', loader_list.length);
			var build_sub_task = () => {
				var i = 0;
				var loader_index = i;
				var _sub_task_params = [];
				for (i = 0; i < page_count - 1; i++) {
					loader_index = i;
					if (loader_index >= loader_list.length) {
						loader_index = loader_list.length - 1;
					}
					var loader = loader_list[loader_index];
					console.log('loader:', loader.id, ',loader_index:', loader_index, ',l len:', loader_list.length);
					var task_params = {
						'id': ithis.task.id + '_' + i,
						'idx': i,
						'source_id': ithis.task.id,
						'start': i * page_size,
						'end': (i + 1) * page_size,
						'over': 0,
						'retry': 0,
						'loader_id': loader.id,
						'state': 0
					};
					_sub_task_params.push(task_params);

				}
				loader_index = 0;
				helpers.iterator(_sub_task_params, (p, idx, cb) => {
					ithis.recover_sub_task(p, () => {
						cb(true);
					});
				}, (rs, idx) => {
					i = page_count - 1;
					var the_last_start = i * page_size;
					var last_task_params = {
						'id': ithis.task.id + '_' + i,
						'idx': i,
						'source_id': ithis.task.id,
						'start': the_last_start,
						'end': l,
						'over': 0,
						'retry': 0,
						'loader_id': loader_list[loader_index].id,
						'state': 0
					};
					if (l - the_last_start > ithis.section_max_size) {
						last_task_params = {
							'id': ithis.task.id + '_' + i,
							'idx': i,
							'source_id': ithis.task.id,
							'start': the_last_start,
							'end': the_last_start + ithis.section_max_size,
							'over': 0,
							'retry': 0,
							'loader_id': loader_list[loader_index].id,
							'state': 0
						};
					}
					// console.log('recover_sub_task last_task_params:', last_task_params);
					ithis.recover_sub_task(last_task_params, () => {
						if (l - the_last_start > ithis.section_max_size) {
							var retain_section_start = the_last_start + ithis.section_max_size;
							var retain_task_params = {
								'id': ithis.task.id + '_' + (i + 1),
								'idx': i + 1,
								'source_id': ithis.task.id,
								'start': retain_section_start,
								'end': l,
								'over': 0,
								'retry': 0,
								'loader_id': 0,
								'state': 7
							};
							item['tasks'].push(retain_task_params);
							console.log('recover_sub_task retain_task_params:', retain_task_params);
							ithis.recover_sub_task(retain_task_params, () => {
								ithis.start_tasker(() => {
									//show dialog
									console.log('send show_dialog!!!!');
									// ithis.sender.send('asynchronous-reply', {'id': item.fs_id, 'info': params['info'], 'tag': 'show_dialog'});
									if (callback) callback();
								});

							});
						} else {
							ithis.start_tasker(() => {
								//show dialog
								console.log('send show_dialog!!!!');
								// ithis.sender.send('asynchronous-reply', {'id': item.fs_id, 'info': params['info'], 'tag': 'show_dialog'});
								if (callback) callback();
							});
						}
					});
				});
			};
		};
		ithis.query_tasker_list_from_local(this.task.id, (task_param_list) => {
			// ithis.pause();
			// ithis.tasks = [];
			// task_param_list.forEach((p)=>{
			// 	console.log('task:', p.id, ',end:', p.end, ',state:',p.state);
			// 	
			// 	ithis.tasks.push(new Tasker(ithis, p));
			// });
			// console.log('task_param_list:', task_param_list);
			helpers.iterator(task_param_list, (p, idx, cb) => {
				// console.log('init sub param:', p);
				ithis.recover_sub_task(p, () => {
					cb(true);
				});
			}, (rs, idx) => {
				if (!ithis.tasks || ithis.tasks.length == 0) {
					var l = loader_list[0];
					ithis._update_rdlink(l, (rdlink, params) => {
						// update type
						if (params && params.hasOwnProperty('type')) {
							ithis.update_type(params['type'], () => {
								query_file_head_callback(rdlink, params);
							});
						} else {
							ithis.nsloader.send({
								'tag': 'alert',
								'msg': '文件头信息获取失败,稍后请重试!'
							});
						}

					});
					// ithis.nsloader.query_file_head(loader_list[0]['dlink'], query_file_head_callback, 'pan.baidu.com');
				} else {
					console.log('active_tasks will start tasker!!');
					ithis.start_tasker(() => {
						//show dialog
						console.log('send show_dialog!!!!');
						//ithis.sender.send('asynchronous-reply', {'id': item.fs_id, 'tag': 'show_dialog'});
					});
				}
			});
		});
	},
	_update_rdlink: function(loader, callback) {
		var ithis = this;
		if (!loader.rdlink || loader.rdlink.length <= 1) {
			ithis.nsloader.query_file_head(loader['dlink'], (rdlink, params) => {
				if (rdlink) {
					var content_type = params['type'];
					var content_length = params['length'];
					var ranges = params['ranges'];
					var rdlink = params['rdlink'];
					loader.size = content_length;
					loader.content_type = content_type;
					loader.rdlink = rdlink;
					download_loader_db.update_by_id(loader['id'], {
						'rdlink': rdlink,
						'size': content_length,
						'content_type': content_type
					}, () => {
						callback(rdlink, params);
					});
				} else {
					console.log('stop here!!!!!');
					var msg = params['info'];
					if (!msg) msg = '获取Dlink失败,请暂停,稍后请重试！';
					ithis.nsloader.send({
						'tag': 'alert',
						'msg': msg
					});
				}
			}, 'pan.baidu.com');
		} else {
			var url = loader.rdlink;
			var content_length = loader.size;
			var content_type = loader.content_type;
			var params = {
				rdlink: url,
				type: content_type,
				length: content_length
			}
			callback(url, params);
		}
	},
	init_dlink: function(callback) {
		var self = this;
		var final_call = () => {
			self.checkout_loader_list((loader_list) => {
				if (loader_list) {
					self.loaders = loader_list;
				}
				if (callback) {
					callback();
				}
			});
		};
		download_loader_db.update_by_conditions({
			'source_id': self.task.id
		}, {
			'pin': 0
		}, function() {
			download_loader_db.query_mult_params({
				'source_id': self.task.id,
				'pin': 0
			}, (loader_list) => {
				var need_rebuild_loader = false;
				if (!loader_list || loader_list.length == 0) {
					need_rebuild_loader = true;
				} else {
					var expired_at = new Date(loader_list[0]['expired_at']);
					console.log("expired_at time:", expired_at.getTime());
					console.log(" Date.now():", Date.now());
					if (expired_at.getTime() < Date.now()) {
						need_rebuild_loader = true;
					}
				}
				if (need_rebuild_loader) {
					var _path = "product/dlink";
					self.nsloader.account.check_state((isok, rs) => {
						var tk = rs.tk;
						service.server_get(rs.tk, _path, {
							"id": self.task.item_id
						}, (err, raw) => {
							if (!err) {
								var body = JSON.parse(raw);
								// console.log('dlink body:', body);
								build_download_loader.apply(self, [body, () => {
									final_call();
								}]);
							}
						});
					});
					// call_pansite_by_post(ithis.context.token, POINT, _path, {"fs_id": ithis.item["fs_id"]}, (result)=>{
					// 	console.log("readydownload result:", result);
					// 	build_download_thread(result, ()=>{

					// 	});
					// });
				} else {
					final_call();
				}
			});
		});
	},
	recover: function(callback) {
		var self = this;
		self.query_tasker_list_from_local(this.task.id, (task_param_list) => {
			helpers.iterator(task_param_list, (p, idx, cb) => {
				self.recover_sub_task(p, () => {
					cb(true);
				});
			}, (rs, idx) => {
				if (callback) callback();
			});
		});
	},
	recover_sub_task: function(sub_task, callback) {
		var self = this;
		var id = sub_task.id;
		// console.log('recover_sub_task sub task id:', id);
		if (self.sub_task_map.hasOwnProperty(id)) {
			// console.log(''+id, ', exits!!!');
			callback(false, self.sub_task_map[id]);
		} else {
			new nsSubTask(sub_task, {
				onReady: (nst) => {
					self.tasks.push(nst);
					self.sub_task_map[id] = nst;
					// console.log('add new sub task:', id, ',tasks len:', self.tasks.length);
					callback(true, nst);
				},
				context: self,
				'point': self.point
			});
		}
	},
	update_type: function(type, cb) {
		this.task['type'] = type;
		console.log('nstask update to type:', type);
		download_task_db.update_by_id(this.task['id'], {
			'type': type
		}, (_id, _params) => {
			if (cb) {
				cb(_id, _params)
			}
		});
	},
	update_state: function(state, cb) {
		this.task['state'] = state;
		console.log('nstask update to state:', state);
		download_task_db.update_by_id(this.task['id'], {
			'state': state
		}, (_id, _params) => {
			if (cb) {
				cb(_id, _params)
			}
		});
	},
	resume: function(callback) {
		var self = this;
		self.init_dlink(() => {
			self.update_state(1, (id, params) => {
				console.log('resume id:', id, ', params:', params, ',state:', self.get_state());
				self.repair_sub_tasks(() => {
					self.active_tasks(() => {
						callback(false);
					});
				});
			});
		});
	},
	save_task: function(callback) {
		var self = this;
		download_task_db.get('id', this.task.id, (_task) => {
			if (_task) {
				console.log('save_task will update task:', self.task.id, ',filename:', self.task.filename);
				download_task_db.update_by_id(self.task.id, self.task, next_fun);
			} else {
				console.log('will new task!');
				download_task_db.put(self.task, next_fun);
			}
		});
		var next_fun = () => {
			if (callback) {
				callback();
			}
			// if(!fs.existsSync(this.download_file_path)){
			//   fs.mkdirSync(this.download_file_path);
			// }
			// if(this.task['state'] == 2){
			// 	MultiFileLoader.instance_map[this.task.id] = this;
			// 	this.sender.send('asynchronous-reply', {'tag': 'synctasks', 'tasks': MultiFileLoader.instance_map})
			// }
		};
	},
	get_loader_by_id: function(loader_id, cb) {
		for (var i = 0; i < this.loaders.length; i++) {
			// console.log(this.loaders[i].id+"?="+loader_id+":", this.loaders[i].id==loader_id);
			if (this.loaders[i].id == loader_id) {
				cb(this.loaders[i]);
				return this.loaders[i];
			}
		}
		download_loader_db.get('id', loader_id, (l) => {
			if (l) {
				cb(l);
			} else {
				cb(null);
			}
		});
	},
	checkout_loader_list: function(cb) {
		var self = this;
		// console.log('checkout_loader_list by source_id:', self.task.id);
		download_loader_db.query_mult_params({
			'source_id': self.task.id
		}, (loader_list) => {
			if (cb) {
				cb(loader_list);
			}
		}, 50, 0, 'order by used desc');
	},
	get_state: function() {
		return this.task['state'];
	},
	is_loading: function() {
		return this.task['state'] == 1;
	},
	check_sub_task_loading_count: function() {
		var self = this;
		var n = 0;
		self.tasks.forEach((st, idx) => {
			if (st.is_loading()) {
				n += 1;
			}
		});
		return n;
	},
	check_next_task: function(key) {
		if (this.check_tasks_events.indexOf(key) < 0) {
			this.check_tasks_events.push(key);
		}
		return true;
	},
	deal_check_tasks_events: function(callback) {
		var self = this;
		if (!self.is_loading()) {
			callback(-1);
			return;
		}
		if (!this.checking_next_task && this.check_tasks_events.length > 0) {
			var _events = [];
			self.idle_cnt = 0;
			this.checking_next_task = true;
			this.check_tasks_events.forEach((e, idx) => {
				_events.push(e);
			});
			_events.forEach((e, i) => {
				var idx = self.check_tasks_events.indexOf(e);
				self.check_tasks_events.splice(idx, 1);
			});
			console.log('_events.length:', _events.length);
			var re_call = function(pos) {
				if (pos >= _events.length) {
					self.checking_next_task = false;
					// console.log('reset checking_next_task:', self.checking_next_task);
					callback(_events.length);
					return;
				}
				console.log('event:', _events[pos]);
				self.arrange_sub_task_list(() => {
					// console.log('will call _check_next_task!');
					self._check_next_task(() => {
						setTimeout(() => {
							re_call(pos + 1);
						}, 100);
					});
				});
			};
			re_call(0);
		} else {

			// console.log('checking_next_task:', this.checking_next_task, ',check_tasks_events len:', this.check_tasks_events.length);
			if (!self.checking_next_task) {
				if (!self.idle_cnt) {
					self.idle_cnt = 1;
				} else {
					self.idle_cnt += 1;
				}
				if (self.idle_cnt >= max_idle_cnt) {
					self.check_next_task('retry');
				}
			}

			callback(0);
		}
	},
	_check_next_task: function(cb) {
		var ithis = this;
		var self = this;
		var min_thread_num = ithis.nsloader.cfg.get('min_thread_num');
		// if(this.checking_next_task){
		// 	console.log('check_next_task return ,waiting !!!!');
		// 	return false;
		// }
		var loader_pos = 0;
		var _loader_list = [];
		// var item = ithis.item;
		var state_0_patch_tasks = [];
		var patch_tasks = [];
		this.checking_next_task = true;
		console.log('check_next_task in!!!!');
		var do_patch_tasks = function() {
			if (patch_tasks.length > 0) {
				ithis._re_call_emit_loader_thread(patch_tasks, (used_cnt) => {
					// console.log('check_next_task, used_cnt, ld_cnt=>', used_cnt, _loader_list.length);
					// self.checking_next_task = false;
					if (cb) cb();

				});

			} else {

				if (cb) cb();
				// self.checking_next_task = false;
			}
		}
		var current_min_thread_num = min_thread_num;
		var final_call = function(comeon) {
			if (comeon) {
				// console.log('final check loaders: pos:', loader_pos, ',list len:', _loader_list.length);
				var l = _loader_list.length;
				console.log('current_min_thread_num:', current_min_thread_num);
				if (l > 0 && l < current_min_thread_num) {
					l = current_min_thread_num;
				}
				if (loader_pos < l) {
					var _lp = loader_pos;
					loader_pos = loader_pos + 1;
					// console.log('loader pos:', _lp);
					console.log('_loader_list len:', _loader_list.length, ',_lp:', _lp);
					if (_lp < _loader_list.length) {
						async_re_call(0, _loader_list[_lp]);
					} else {
						async_re_call(0, _loader_list[_loader_list.length - 1]);
					}
				} else {
					do_patch_tasks();
				}
			} else {
				if (patch_tasks.length == 0) {
					var _l = state_0_patch_tasks.length;
					if (_l > 0) {
						if (_l > 0 && _l < current_min_thread_num) {
							_l = current_min_thread_num;
						}
						for (var k = 0; k < _l; k++) {
							patch_tasks.push(state_0_patch_tasks[k]);
						}
					}
				}
				do_patch_tasks();
			}
		};

		var async_re_call = (pos, loader) => {
			// console.log('async_re_call pos:', pos, ',tasks len:', ithis.tasks.length);
			if (pos >= ithis.tasks.length) {
				final_call(false);
				return;
			}
			var t = ithis.tasks[pos];
			if (!t || !t.get_state) {
				setTimeout(()=>{async_re_call(pos, loader);},1);
				// Primary.resolve().then(() => {
				// 	async_re_call(pos, loader);
				// });
				return;
			}
			// console.log('t.get_state:', typeof(t.get_state));
			if (t.get_state() == 7) { //处理一下 state:3中途失败的段
				console.log('find 7 state pos:', pos);
				t.params.loader_id = loader.id;
				t.params.state = 0;
				var retain_section_start = t.params.start + ithis.section_max_size;
				var retain_section_end = t.params.end;
				if (retain_section_end >= retain_section_start) {
					t.params.end = retain_section_start;
				}
				t.params.loader_id = loader.id;

				if (retain_section_start < retain_section_end) {
					var new_id = t.params.id + '_1';
					if (t.params.idx > 0) {
						var id_vals = t.params.id.split('_');
						var the_last_v = id_vals[id_vals.length - 1];
						the_last_v = parseInt(the_last_v) + 1;
						id_vals[id_vals.length - 1] = the_last_v;
						new_id = id_vals.join('_');
					}
					var fn = new_id;
					var new_sub_file_path = path.join(self.download_file_path, fn);
					if (fs.existsSync(new_sub_file_path)) {
						new_id = new_id + '_1';
					}
					var task_params = {
						'id': new_id,
						'source_id': ithis.task.id,
						'start': retain_section_start,
						'end': retain_section_end,
						'over': 0,
						'idx': 1,
						'retry': 0,
						'loader_id': 0,
						'state': 7
					};
					// item['tasks'].push(task_params);
					ithis.recover_sub_task(task_params, (_rs, nst) => {
						t.params.end = retain_section_start;
						t.params.state = 0;
						download_sub_task_db.update_by_id(t.params.id, {
							'end': t.params.end,
							'loader_id': t.params.loader_id,
							'state': 0
						}, () => {
							// ithis.tasks.push(task);
							patch_tasks.push(t);
							final_call(true);
						});
					});
					// var task = new Tasker(ithis, task_params);
					// task.save(()=>{
					// 	t.params.end = retain_section_start;
					// 	t.params.state = 0;
					// 	download_sub_task_db.update_by_id(t.params.id, {'end':t.params.end, 'loader_id':t.params.loader_id, 'state': 0}, ()=>{
					// 		ithis.tasks.push(task);
					// 		patch_tasks.push(t);
					// 		final_call(true);
					// 	});
					// });
				} else {
					download_sub_task_db.update_by_id(t.params.id, {
						'loader_id': t.params.loader_id,
						'state': 0
					}, () => {
						patch_tasks.push(t);
						final_call(true);
					});
				}
			} else if (t.get_state() == 3) {
				var renew_sub_task = () => {
					// var new_id = t.params.id+'_1';
					var suffix = 1;
					var new_id_prefix = t.params.id + '_';
					if (t.params.idx == 2) {
						var id_vals = t.params.id.split('_');
						var the_last_v = id_vals[id_vals.length - 1];
						the_last_v = parseInt(the_last_v) + 1;
						suffix = the_last_v;
						id_vals[id_vals.length - 1] = ''; //the_last_v;
						// new_id = id_vals.join('_');
						new_id_prefix = id_vals.join('_');
					}
					var new_id = new_id_prefix + suffix;
					var fn = new_id;
					var new_sub_file_path = path.join(self.download_file_path, fn);
					if (fs.existsSync(new_sub_file_path)) {
						// new_id = new_id + '_1';
						new_id_prefix = new_id_prefix + "0_";
					}
					t.try_close_pipe();
					var new_start = t.params.start;
					var _sub_t_loader_id = t.params.loader_id;
					// if(''+_sub_t_loader_id == '0'){
					// 	_sub_t_loader_id = loader.id;
					// }
					_sub_t_loader_id = loader.id;
					var total_size = t.params.end - new_start;
					var new_task_params_list = [];
					if (total_size >= ithis.section_min_size * 2) {
						var mid = Math.round(total_size / 2);
						new_task_params_list.push({
							'id': new_id_prefix + suffix,
							'source_id': t.params.source_id,
							'start': new_start,
							'end': new_start + mid,
							'over': 0,
							'idx': 2,
							'retry': 0,
							'loader_id': _sub_t_loader_id,
							'state': 0,
							'patch': 0
						});
						new_task_params_list.push({
							'id': new_id_prefix + '0_' + suffix,
							'source_id': t.params.source_id,
							'start': new_start + mid,
							'end': t.params.end,
							'over': 0,
							'idx': 2,
							'retry': 0,
							'loader_id': _sub_t_loader_id,
							'state': 0,
							'patch': 0
						});
					} else {
						new_task_params_list.push({
							'id': new_id_prefix + suffix,
							'source_id': t.params.source_id,
							'start': new_start,
							'end': t.params.end,
							'over': 0,
							'idx': 2,
							'retry': 0,
							'loader_id': _sub_t_loader_id,
							'state': 0,
							'patch': 0
						});
					}
					var new_task_list = [];
					var build_new_task = (pos, cb) => {
						if (pos >= new_task_params_list.length) {
							if (cb) cb();
							return;
						}
						var _p = new_task_params_list[pos];
						ithis.recover_sub_task(_p, (_rs, nst) => {
							new_task_list.push(nst);
							build_new_task(pos + 1, cb);
						});
						// var _task = new Tasker(ithis, _p);
						// _task.save(()=>{
						// 	new_task_list.push(_task);
						// 	build_new_task(pos + 1, cb);
						// });
					};
					build_new_task(0, () => {
						t.update_state(2, () => {
							t.update_pos(t.params.start, new_start, () => {
								ithis.del_sub_task(t, (sub_task, context) => {
									// var _idx = context.tasks.indexOf(sub_task);
									// if(_idx>=0){
									// 	context.tasks.splice(_idx,1);
									// }
									new_task_list.forEach((_t, idx) => {
										// ithis.tasks.push(_t);
										patch_tasks.push(_t);
									});
									final_call(true);
								});
							});
						});
					});
					/*
					var task_params = {'id':new_id, 'source_id':t.params.source_id, 'start':new_start, 'end':t.params.end, 'over':0, 'idx':2, 'retry':0, 'loader_id': _sub_t_loader_id, 'state': 0, 'patch': 1};
					var _task = new Tasker(ithis, task_params);
					_task.save(()=>{
						t.update_state(2,()=>{
							t.update_pos(t.params.start, new_start, ()=>{
								ithis.del_sub_task(t, (sub_task, context)=>{
									var _idx = context.tasks.indexOf(sub_task);
									// if(_idx>=0){
									// 	context.tasks.splice(_idx,1);
									// }
									ithis.tasks.push(_task);
									patch_tasks.push(_task);
									final_call(true);
								});
							});
						});
						
					});
					*/
				};
				renew_sub_task();
			} else {
				if (t.get_state() == 0) {
					//state_0_patch_tasks.push(t);
					patch_tasks.push(t);
					final_call(true);
				} else {
					async_re_call(pos + 1, loader);
				}
			}
		}

		// download_loader_db.query_mult_params({'source_id':self.task.id, 'pin':0}, (loader_list)=>{
		// 	// var page_count = loader_list.length;
		// 	// if(page_count>0){
		// 	// 	async_re_call(0, loader_list[0]);
		// 	// }
		// 	_loader_list = loader_list;
		// 	console.log('_loader_list len:', _loader_list.length);
		// 	final_call(true);

		// });
		var running_cnt = self.check_sub_task_loading_count();

		if (min_thread_num - running_cnt > 0) {
			current_min_thread_num = min_thread_num - running_cnt;
			self.checkout_loader_list((loader_list) => {
				_loader_list = loader_list;
				console.log('_loader_list len:', _loader_list.length);
				final_call(true);
			});
		} else {
			final_call(false);
		}
		return true;
	},
	pause: function() {
		var ithis = this;
		if (ithis.tasks && ithis.tasks.length > 0) {
			ithis.tasks.forEach((t, idx) => {
				t.try_close_pipe();
			});
		}
		this.update_state(3);
		ithis.nsloader.looper.removeListener(ithis.task.id);
	},
	bind_listener: function() {
		var ithis = this;
		var total_length = ithis.get_total_length();
		var last_get_size = 0
		var counter = 0;
		var speed = '?K';
		var exhaust = '?S';
		var total_seconds = 0;
		// var load_timeout = 5*60*1000;
		var dirty = false;
		var looper_listener = function(p) {
			var total_size = total_length;
			var total_file_size = ithis.get_download_size();
			var complete_total_file_size = ithis.get_download_complete_size();

			var all_over = complete_total_file_size == total_length;
			all_over = complete_total_file_size >= total_length;
			// console.log("total_size:", total_size, ',total_file_size:', total_file_size, ',complete_total_file_size:', complete_total_file_size)
			// console.log("total_size:", total_size);
			// console.log("total_file_size:", total_file_size);
			// var r = build_percentage(total_file_size, total_length);
			// if(last_get_size == 0){
			//   last_get_size = total_file_size;
			// }else{
			//   total_seconds = total_seconds + 1;
			//   counter = counter + 1;
			//   if(counter >= max_counter){
			// 	last_get_size = total_file_size;
			// 	counter = 0;
			//   }else if(total_file_size>=last_get_size){
			// 	if(counter >= min_counter){
			// 				  var real_speed = (total_file_size-last_get_size)/counter;
			// 				  if(real_speed>0){
			// 					  exhaust = Math.round((p.total-total_file_size)/real_speed) + 'S';
			// 				  }
			// 	  speed = scale_size(real_speed);  
			// 	}
			//   }
			// }

			// // ithis.sender.send('asynchronous-reply', {'id': ithis.task.id, 'over':all_over, 'info': "已经下载:"+r+"%,平均速率:"+speed+",已耗时:"+total_seconds+"S,约需耗时:"+exhaust, 'tag': 'progress'});
			// var sub_task_params = [];
			// if(ithis.is_loading()) {
			// 	ithis.tasks.forEach((t, index)=>{
			// 		if(t.params.state!=7){
			// 			sub_task_params.push(t.params);
			// 		}
			// 	});
			// }
			if (!all_over) {
				if (counter > 3) {
					counter = 0;
					ithis.deal_check_tasks_events((cnt) => {
						if (cnt > 0) console.log('deal cnt:', cnt)
					});
				} else {
					counter += 1;
				}
				return false;
			} else {
				ithis.clean_tasks();
				if (ithis.check_all_sub_task_state_is_complete()) {
					setTimeout(() => {
						ithis.merge_final_file(() => {
							// ithis.sender.send('asynchronous-reply', {'id': ithis.task.id, 'over':all_over, 'task': ithis.task, 'tag':'sub_tasks', 'tasks_params':sub_task_params, 'total_length': total_length, 'total_file_size':total_file_size, "speed": speed, "need": exhaust});
						});
					}, 3000);
					return true;
				} else {
					return false;
				}
			}
			// if(all_over){
			//   ithis.merge_final_file(()=>{
			// 	  ithis.sender.send('asynchronous-reply', {'id': ithis.task.id, 'over':all_over, 'task': ithis.task, 'tag':'sub_tasks', 'tasks_params':sub_task_params, 'total_length': total_length, 'total_file_size':total_file_size, "speed": speed, "need": exhaust});
			//   });
			//   return true;
			// }else{
			//   ithis.deal_check_tasks_events((cnt)=>{if(cnt>0)console.log('deal cnt:', cnt)});
			//   if(ithis.is_ready){
			// 	  ithis.sender.send('asynchronous-reply', {'id': ithis.task.id, 'over':all_over, 'task': ithis.task, 'tag':'sub_tasks', 'tasks_params':sub_task_params, 'total_length': total_length, 'total_file_size':total_file_size, "speed": speed, "need": exhaust});
			//   }
			//   return false;
			// }
		};
		ithis.nsloader.looper.addListener(ithis.task.id, looper_listener, {
			context: this,
			total: total_length
		});
	},
	check_all_sub_task_state_is_complete: function() {
		var all_is_ok = true;
		var len = this.tasks.length;
		for (var i = 0; i < len; i++) {
			var t = this.tasks[i];
			if (t.get_state() != 2) {
				all_is_ok = false;
				break;
			}
		}
		return all_is_ok;
	},
	valid_tasks_order: function() {
		var ithis = this;
		this.tasks.sort(function(task_a, task_b) {
			return task_a.params["start"] - task_b.params["start"];
		});
		var all_sub_files = []
		var all_sub_tasks = []
		this.tasks.forEach(function(t, index) {
			var fn = t.params.id;
			var file_path = path.join(ithis.download_file_path, fn);
			var t_size = t.check_file_size();
			console.log('t_size:', t_size, ',fn:', t.params.id);
			if (t_size > 0) {
				all_sub_files.push(file_path);
				all_sub_tasks.push(t);
			}
		});
		var pass = false;
		var pos = 0;
		var last_id = '';
		// console.log('all_sub_files:', all_sub_files);
		for (var i = 0; i < all_sub_tasks.length; i++) {
			var t = all_sub_tasks[i];
			var start_at = t.params["start"];
			if (pos == start_at) {
				last_id = t.params["id"];
				pos = t.params["end"];
			} else {
				console.log('valid_tasks_order failed, valid pos:', pos, ',task start pos:', start_at, ',last_id:', last_id,
					',id:', t.params["id"]);
				return null;
			}
		}
		return all_sub_files;
	},
	merge_final_file: function(final_cb) {
		var ithis = this;
		var final_file = path.join(ithis.download_file_path, ithis.task.filename);
		// this.tasks.sort(function(task_a, task_b){
		// 	return task_a.params["start"] - task_b.params["start"];
		// });
		// var all_sub_files = []
		// this.tasks.forEach(function(t, index){
		// 	var fn = t.params.id;
		// 	var file_path = path.join(ithis.download_file_path, fn);
		// 	if(t.check_file_size()>0){
		// 		all_sub_files.push(file_path);
		// 	}
		// });
		var all_sub_files = ithis.valid_tasks_order();
		if (all_sub_files && all_sub_files.length > 0) {

			setTimeout(() => {
				helpers.append_merge_files(all_sub_files, final_file, function(info) {
					console.log("合并完成!");
					console.log("md5:", ithis.task.md5_val);
					console.log("final_file:", final_file);
					const input = fs.createReadStream(final_file);
					var md5 = crypto.createHash('md5');
					input.on('data', (chunk) => {
						md5.update(chunk);
					}).on('end', () => {
						var filemd5 = md5.digest('hex');
						console.log(filemd5);
						if (ithis.task.md5_val == filemd5) {
							console.log("成功!清除辅助文件...");
							// ithis.complete();
						} else {
							console.log("MD5比对失败!清除辅助文件...");
						}
						ithis.complete(() => {
							if (final_cb) final_cb();
						});
					});
				});
			}, 1000);
		} else {
			console.log('合并失败!!!!!!!!!!!!!!!!!!!!');
			if (!ithis.retry_merge) {
				ithis.retry_merge = 1;
				setTimeout(() => {
					ithis.merge_final_file(final_cb);
				}, 3000);
			} else {
				if (final_cb) final_cb();
			}

		}
	},
	_re_call_emit_loader_thread: function(subtasks, fc) {
		var self = this;
		var used_cnt = 0;
		var re_call = function(pos) {
			// console.log('_re_call_emit_loader_thread pos:',pos);
			if (pos >= subtasks.length) {
				console.log('_re_call_emit_loader_thread will be over [pos == len]:', pos);
				fc(used_cnt);
				return;
			}
			var t = subtasks[pos];
			// console.log('sub task:', t.params.id, ',st:', t.get_state());
			if (t.get_state() == 0) {
				used_cnt = used_cnt + 1;
				t.ready_emit_loader_thread(() => {
					re_call(pos + 1);
				});
			} else if (t.get_state() == 7) {
				re_call(pos + 1);
			} else {
				re_call(pos + 1);
			}
		};
		re_call(0);
	},
	emit_tasks: function(cb) {
		var ithis = this;
		var ld_cnt = ithis.loaders.length;
		var final_call = function(used_cnt) {
			console.log('emit_tasks, used_cnt, ld_cnt=>', used_cnt, ld_cnt);
			if (used_cnt == 0 || used_cnt < ld_cnt) {
				ithis.check_next_task('init');
			}
			ithis.bind_listener();
			if (cb) cb();
		};
		this._re_call_emit_loader_thread(this.tasks, final_call);
	},
	ready_emit_tasks: function(cb) {
		console.log("ready_emit_tasks in.emit_tag:", this.emit_tag);
		var self = this;
		if (this.emit_tag) {
			if (typeof(this.emit_tag) == "function") {
				if (this.emit_tag()) {
					this.update_state(1, () => {
						self.emit_tasks(cb);
					});
				} else {
					console.log('emit_tag return false!!!');
				}
			} else {
				this.update_state(1, () => {
					self.emit_tasks(cb);
				});
			}
		} else {
			if (cb) cb();
		}
		self.is_ready = true;
		// MultiFileLoader.instance_map[this.task.id] = this;
		// this.sender.send('asynchronous-reply', {'tag': 'synctasks', 'tasks': MultiFileLoader.instance_map})
	},
	re_arrange_sub_task_list: function() {
		var ithis = this;
		ithis.tasks.sort(function(task_a, task_b) {
			return task_a.params["start"] - task_b.params["start"];
		});
		var task_list = [];
		var pos = null;
		var pos_init = false;
		for (var i = 0; i < ithis.tasks.length; i++) {
			var t = ithis.tasks[i];
			if (t.get_state() == 2) {
				if (t.size() > 0) {
					if (pos == null && !pos_init) {
						pos_init = true;
						pos = t.params["end"];
						task_list.push(t);
					} else {
						if (pos == t.params["start"]) {
							task_list.push(t);
							pos = t.params["end"];
						} else {
							break;
						}
					}
				}
			} else {
				break;
			}
		}
		return task_list;
	},
	arrange_sub_task_list: function(cb) {
		var ithis = this;
		if (ithis.arrange_sub_task_list_running) {
			if (cb) cb();
			return;
		}
		var final_call = () => {
			ithis.arrange_sub_task_list_running = false;
			if (cb) cb();
		};
		ithis.tasks.sort(function(task_a, task_b) {
			return task_a.params["start"] - task_b.params["start"];
		});
		var task_list = ithis.re_arrange_sub_task_list();

		console.log('arrange_sub_task_list task_list len:', task_list.length);
		if (task_list.length > 4) {
			task_list.splice(-4, 4);
			ithis.merge_task_files(task_list, final_call);
		} else {
			final_call();
		}
	},
	merge_task_files: function(task_list, cb) {
		var ithis = this;
		var final_call = () => {
			if (cb) {
				cb();
			}
			// if(this.need_clear_task_list.length>0){
			// 	ithis.cleanTasks(need_clear_task_list);
			// }
		};

		function merge_a2b(t_a, t_b, target_file_name, callback, retry_cnt) {
			// console.log('t_a :', t_a);
			// console.log('t_a id:', t_a.params.id);
			// console.log('t_b :', t_b);
			// console.log('t_b id:', t_b.params.id);
			console.log('merge_a2b target_file_name:', target_file_name);
			var a_fn = t_a.params.id,
				b_fn = t_b.params.id;
			var a_file_path = path.join(ithis.download_file_path, a_fn);
			var b_file_path = path.join(ithis.download_file_path, b_fn);
			console.log("a_file_path, b_file_path:", a_file_path, b_file_path);
			if (fs.existsSync(a_file_path) && fs.existsSync(b_file_path)) {
				console.log("merge in.");
				var states = fs.statSync(a_file_path);
				var a_file_size = states.size;
				states = fs.statSync(b_file_path);
				var b_file_size = states.size;
				var final_target_file_name = "__" + target_file_name;
				var _final_file_path = path.join(ithis.download_file_path, final_target_file_name);
				if (fs.existsSync(_final_file_path)) {
					fs.unlinkSync(_final_file_path);
				}
				var final_file = _final_file_path;
				var target_fs = fs.createWriteStream(final_file);
				var stream = fs.createReadStream(a_file_path);
				stream.pipe(target_fs, {
					end: false
				});
				stream.on("end", function() {
					var b_stream = fs.createReadStream(b_file_path);
					b_stream.pipe(target_fs);
					b_stream.on("end", function() {
						setTimeout(() => {
							var final_states = fs.statSync(_final_file_path);
							if (final_states.size == a_file_size + b_file_size) {
								// fs.unlinkSync(a_file_path);
								// fs.unlinkSync(b_file_path);
								// var final_file_path = path.join(ithis.download_file_path, target_file_name);
								// if(fs.existsSync(final_file_path)){
								//  fs.unlinkSync(final_file_path);
								// }
								//////////new
								final_states = fs.statSync(_final_file_path);
								console.log('[new fn]', final_target_file_name, ',size:', final_states.size);
								callback(final_states.size, final_target_file_name, a_file_path, b_file_path);
								///////////////////
								// fs.rename(_final_file_path, final_file_path, (err)=>{
								//  if(err) throw err;
								// if(callback){
								// 	final_states = fs.statSync(final_file_path);
								// 	console.log('file rename:',_final_file_path,'[TO]',final_file_path,',size:',final_states.size);
								// 	callback(final_states.size, a_file_path, b_file_path);
								// } 
								// });
							} else {
								// if(callback){
								// 	callback(final_states.size);
								// }
								if (!retry_cnt) {
									retry_cnt = 1;
									console.log('retry merge_a2b:', a_fn, ',b_fn:', b_fn);
									merge_a2b(t_a, t_b, target_file_name, callback, retry_cnt);
								} else {
									throw "merge file failed!"
								}
							}
						}, 10);

					});
				});
			} else {
				if (callback) {
					callback(0);
				}
			}
		}
		var merge_task_map = {};

		function deep_merge_task(pos) {
			if (pos >= task_list.length) {
				console.log("deep_merge_task final will call cb!");
				final_call();
				return;
			}
			var t = task_list[pos];
			// console.log("pos:", pos, task_list.length);
			// console.log("params:", t.params);
			// console.log("state:", t.params.state);
			if (t.params.end - t.params.start == 0) {
				deep_merge_task(pos + 1);
				return;
			}
			if (t.params.state == 0) {
				deep_merge_task(pos + 1);
			} else if (t.params.state == 2) {
				if (pos == 0) {
					merge_task_map[pos] = t;
					deep_merge_task(pos + 1);
				} else if (merge_task_map.hasOwnProperty(pos - 1)) {
					var target_file_name = t.params.id;
					var t_a = merge_task_map[pos - 1];
					var t_b = t;
					merge_a2b(t_a, t_b, target_file_name, (new_size, final_target_file_name, a_file_path, b_file_path) => {
						console.log("update_pos:", t_a.params.start, new_size);
						if (new_size > 0) {
							var task_params = helpers.extend({}, t_b.params);
							task_params['id'] = final_target_file_name;
							task_params['start'] = t_a.params.start;
							task_params['end'] = t_a.params.start + new_size;
							ithis.recover_sub_task(task_params, (_rs, nst) => {
								merge_task_map[pos] = nst;
								t_a.update_pos(t_a.params.start, t_a.params.start, () => {
									t_b.update_pos(t_b.params.start, t_b.params.start, () => {
										t_a.del(() => {
											t_b.del(() => {
												try {
													fs.unlinkSync(a_file_path);
												} catch (e) {}
												try {
													fs.unlinkSync(b_file_path);
												} catch (e) {}
												ithis.need_clear_task_list.push(t_a);
												ithis.need_clear_task_list.push(t_b)
												deep_merge_task(pos + 1);
											});
										});

									});
								});
							});
						} else {
							deep_merge_task(pos + 1);
						}
					});
				} else {
					merge_task_map[pos] = t;
					deep_merge_task(pos + 1);
				}
			} else {
				deep_merge_task(pos + 1);
			}
		}
		deep_merge_task(0);
	},
	clean_tasks: function() {
		if (this.need_clear_task_list.length > 0) {
			var n_c_t_l = this.need_clear_task_list;
			this.need_clear_task_list = [];
			this._cleanTasks(n_c_t_l);
		}
	},
	_cleanTasks: function(dirty_tasks) {
		var self = this;
		var idx_list = [];
		for (var i = 0; i < self.tasks.length; i++) {
			var t = self.tasks[i];
			if (dirty_tasks.indexOf(t) >= 0) {
				idx_list.push(i);
			}
		}
		if (idx_list && idx_list.length > 0) {
			idx_list = idx_list.sort().reverse();
			idx_list.forEach((idx, _) => {
				var t = self.tasks.splice(idx, 1);
				if (t && t.params) {
					console.log('clear task:', t.params.id)
					if (dirty_tasks.indexOf(t) < 0) {
						self.tasks.push(t);
					} else {
						delete this.sub_task_map[t.params.id];
					}
				}
			});
		}
	},
	check_sub_tasks_running: function() {
		var self = this;
		for (var i = 0; i < self.tasks.length; i++) {
			var t = self.tasks[i];
			if (t.get_state() == 1) {
				return true;
			}
		}
		return false;
	},
	start_tasker: function(on_end) {
		/*
		{"id": "486285832886933_0", "source_id": "486285832886933", "start": 0, "end": 187011800, "over": 0, "pos": 0, "retry": 0, "loader_id": 0, "state": 2}, {"id": "486285832886933_1", "source_id": "486285832886933", "start": 187011800, "end": 374023600, "over": 0, "pos": 0, "retry": 0, "loader_id": 0, "state": 2}, {"id": "486285832886933_2", "source_id": "486285832886933", "start": 374023600, "end": 561035400, "over": 0, "pos": 0, "retry": 0, "loader_id": 0, "state": 2}, {"id": "486285832886933_3", "source_id": "486285832886933", "start": 561035400, "end": 748047200, "over": 0, "pos": 0, "retry": 0, "loader_id": 0, "state": 3}, {"id": "486285832886933_4", "source_id": "486285832886933", "start": 748047200, "end": 935059000, "over": 0, "pos": 0, "retry": 0, "loader_id": 0, "state": 2}, {"id": "486285832886933_5", "source_id": "486285832886933", "start": 935059000, "end": 1122070800, "over": 0, "pos": 0, "retry": 0, "loader_id": 0, "state": 2}, {"id": "486285832886933_6", "source_id": "486285832886933", "start": 1122070800, "end": 1309082600, "over": 0, "pos": 0, "retry": 0, "loader_id": 0, "state": 2}, {"id": "486285832886933_7", "source_id": "486285832886933", "start": 1309082600, "end": 1496094400, "over": 0, "pos": 0, "retry": 0, "loader_id": 0, "state": 2}, {"id": "486285832886933_8", "source_id": "486285832886933", "start": 1496094400, "end": 1683106197, "over": 0, "pos": 0, "retry": 0, "loader_id": 0, "state": 2},
		*/
		var ithis = this;
		ithis.is_ready = false;
		var maybe_merge = false;
		this.tasks.sort(function(task_a, task_b) {
			return task_a.params["start"] - task_b.params["start"];
		});

		var new_tasks = [];
		var async_cnt = 0;
		var async_re_call = (pos) => {
			if (pos >= ithis.tasks.length) {
				final_call();
				return;
			}
			var t = ithis.tasks[pos];
			if (t.get_state() == 7) {
				// final_call();
				async_re_call(pos + 1);
				return;
			}
			console.log("start_tasker id:%s, source_id:%s", t.params.id, t.params.source_id);
			var params = t.params
			var fn = t.params.id;
			var file_path = path.join(ithis.download_file_path, fn);
			if (fs.existsSync(file_path)) {
				var states = fs.statSync(file_path);
				if (states.size > 0) {
					if (t.size() == states.size) {
						if (2 != t.get_state()) {
							t.update_state(2, () => {
								async_re_call(pos + 1);
							});
							maybe_merge = true;
						} else {
							async_re_call(pos + 1);
						}
					} else if (t.size() > states.size) {
						// if(states.size < skip_size){
						// 	t.update_state(3,()=>{
						// 		fs.unlinkSync(file_path);
						// 		async_re_call(pos+1);
						// 	});
						// } else {
						// var new_start = t.params.start+states.size;
						var new_start = t.params.start;
						var id_prefix = t.params.id
						if (id_prefix.split("_").length > 4) {
							id_prefix = id_prefix.split("_")[0];
						}
						var task_params = {
							'id': id_prefix + '_' + pos,
							'source_id': t.params.source_id,
							'start': new_start,
							'end': t.params.end,
							'over': 0,
							'idx': t.params.idx,
							'retry': 0,
							'loader_id': t.params.loader_id,
							'state': 0
						};
						ithis.recover_sub_task(task_params, (_rs, nst) => {
							async_cnt += 1;
							t.update_pos(t.params.start, new_start, () => {
								t.update_state(2, () => {
									t.check_file_size();
									async_re_call(pos + 1);
								});
							});
							new_tasks.push(nst);
							maybe_merge = true;

						});
						// var _task = new Tasker(ithis, task_params);
						// async_cnt += 1;
						// _task.save(()=>{
						// 	t.update_pos(t.params.start, new_start, ()=>{
						// 		t.update_state(2,()=>{
						// 			t.check_file_size();
						// 			async_re_call(pos+1);
						// 		});
						// 	});
						// });
						// new_tasks.push(_task);
						// maybe_merge = true;
						// }
					} else {
						async_re_call(pos + 1);
					}
				} else {
					async_re_call(pos + 1);
				}
			} else {
				async_re_call(pos + 1);
			}
		};

		console.log("new_tasks len:", new_tasks.length);
		var final_call = () => {
			if (new_tasks.length > 0) {
				// new_tasks.forEach(function(t){ithis.tasks.push(t);});
				ithis.tasks.sort(function(task_a, task_b) {
					return task_a.params["start"] - task_b.params["start"];
				});
			}
			var _wrap_on_end = () => {
				if (on_end) {
					on_end();
				}
			};
			console.log("maybe_merge:", maybe_merge);
			if (maybe_merge) {
				var to_merge_task_list = ithis.re_arrange_sub_task_list();
				ithis.merge_task_files(to_merge_task_list, () => {
					// ithis.re_build_sub_tasks();
					ithis.ready_emit_tasks(_wrap_on_end);
				});
			} else {
				ithis.ready_emit_tasks(_wrap_on_end);
			}
		};
		async_re_call(0);
	},
	get_download_complete_size: function() {
		var ithis = this;
		var get_size = 0;
		this.tasks.forEach(function(t, index) {
			var params = t.params
			var fn = t.params.id;
			if (t.get_state() == 2) {
				var task_file_size = t.check_file_size();
				get_size = get_size + task_file_size;
			}
		});
		return get_size;
	},
	get_download_size: function() {
		var ithis = this;
		var get_size = 0;
		this.tasks.forEach(function(t, index) {
			var params = t.params;
			// console.log('get_download_size t type:', typeof(t), ',params:', params);
			if (!params) console.log('get_download_size t params:', params);
			if (params) {
				var fn = t.params.id;
				if (t.get_state() == 2 || t.get_state() == 1) {
					var task_file_size = t.check_file_size();
					get_size = get_size + task_file_size;
				}
			}
			// var task_file_size = t.check_file_size();
			// get_size = get_size + task_file_size;
		});
		return get_size;
	},
	get_total_length: function() {
		if (this.task.hasOwnProperty("total_length")) {
			return this.task.total_length;
		} else {
			var max_size = 0;
			this.tasks.forEach(function(t, index) {
				if (max_size < t.params.end) {
					max_size = t.params.end;
				}
			});
			return max_size;
		}
	},
	update_task: function(key, value, cb) {
		this.task[key] = value;
		var params = {};
		params[key] = value;
		download_task_db.update_by_id(this.task['id'], params, (_id, _params) => {
			if (cb) {
				cb(_id, _params);
			}
		})
	},
	patch_task_params: function(task_params) {
		var fields = ['state', 'total_length', 'tm'];
		fields.forEach((k, index) => {
			if (task_params.hasOwnProperty(k)) {
				this.task[k] = task_params[k];
			}
		});
		// console.log('new task:', this.task);
	},
	del_sub_task: function(sub_task, cb) {
		var ithis = this;
		if (!sub_task) {
			if (cb) {
				cb(sub_task, ithis);
			}
			return;
		}
		var fn = sub_task.params.id;
		sub_task.del(() => {
			try {
				var file_path = path.join(ithis.download_file_path, fn);
				if (fs.existsSync(file_path)) {
					fs.unlinkSync(file_path);
				}
			} catch (e) {
				console.error(e);
			}
			if (cb) {
				cb(sub_task, ithis);
			}
		});
	},
	complete: function(cb) {
		var ithis = this;
		var self = this;
		this.update_state(2, () => {
			ithis.tasks.forEach(function(t, index) {
				ithis.del_sub_task(t)
			});
			ithis.checkout_loader_list((loader_list) => {
				if (loader_list && loader_list.length > 0) {
					var ids = [];
					var useds = [];
					loader_list.forEach((l, idx) => {
						if (l.used && l.used != 0) {
							ids.push(l.pan_account_id);
							useds.push(l.used);
						}
					});
					if (ids.length > 0) {
						self.nsloader.account.check_state((isok, rs) => {
							var _path = "source/sync_used";
							call_pansite_by_post(rs.tk, ithis.point, _path, {
								"ids": ids.join(','),
								"useds": useds.join(',')
							}, (result) => {
								console.log('同步used数据完成!');
							});
						});
					}
				}
				download_loader_db.del('source_id', ithis.task.id, () => {
					if (cb) {
						cb();
					}
				});
			});

		});

	},
	del: function(cb) {
		var ithis = this;
		this.complete(() => {
			console.log('del task:', ithis.task);
			console.log('del path:', ithis.download_file_path);
			try {
				if (fs.existsSync(ithis.download_file_path)) {
					fs.rmdirSync(ithis.download_file_path);
				}
				download_task_db.del('id', ithis.task.id, () => {
					ithis.nsloader.looper.removeListener(ithis.task.id);
					if (cb) {
						cb();
					}
				});
			} catch (err) {
				console.log('err:', err);
				ithis.nsloader.send({
					'tag': 'alert',
					'msg': '文件下载后未迁移,目录删除失败!'
				});
				if (cb) {
					cb();
				}
			}

		});
	},
	repair_sub_tasks: function(callback) {
		var self = this;
		var repair_items = (sub_tasks) => {
			var last_task = null;
			var need_patch_items = [];

			function deal_sub_task(pos) {
				if (pos >= sub_tasks.length) {
					if (callback) callback();
					return;
				}
				var sub_task_param = sub_tasks[pos];
				if (sub_task_param['state'] == 7) {
					deal_sub_task(pos + 1);
					return;
				}
				if (last_task == null) {
					last_task = sub_task_param;
					deal_sub_task(pos + 1);
				} else {
					var check_start_at = last_task['end'];
					if (check_start_at == sub_task_param['start']) {
						last_task = sub_task_param;
						deal_sub_task(pos + 1);
					} else {
						var n_start = check_start_at;
						var n_end = sub_task_param['start'];
						var prefix_id = last_task.id;
						var path_task_params = {
							'id': prefix_id + '_1',
							'source_id': last_task.source_id,
							'start': n_start,
							'end': n_end,
							'over': 0,
							'idx': 0,
							'retry': 0,
							'loader_id': last_task.loader_id,
							'state': 0
						};
						console.log('path_task_params:', path_task_params);
						download_sub_task_db.get('id', path_task_params['id'], (_task) => {
							if (_task) {
								path_task_params['id'] = path_task_params['id'] + '_1';
								download_sub_task_db.put(path_task_params, () => {
									last_task = sub_task_param;
									deal_sub_task(pos + 1);
								});
							} else {
								download_sub_task_db.put(path_task_params, () => {
									last_task = sub_task_param;
									deal_sub_task(pos + 1);
								});
							}
						});
					}
				}
			}
			deal_sub_task(0);
		}
		self.query_tasker_list_from_local(self.task.id, (sub_tasks) => {
			if (sub_tasks && sub_tasks.length > 0) {
				sub_tasks.sort(function(params_a, params_b) {
					return params_a["start"] - params_b["start"];
				});
				var _sub_tasks = [];
				sub_tasks.forEach((st, idx) => {
					if (st['end'] - st['start'] > 0) {
						_sub_tasks.push(st);
					}
				});
				repair_items(_sub_tasks);
			} else {
				if (callback) callback();
			}
		});
	},
	move_file: function(cb) {
		var ithis = this;
		// var default_path = this.nsloader.account.get_default_save_path((default_save_path)=>{
		// 	_move_file(default_save_path);
		// 	// ithis._show_alert('测试一下!')
		// });
		var final_call = function(v) {
			if (v == 1) { // err
				if (cb) {
					cb(v);
				}
			} else {
				ithis.update_state(9, () => {
					if (cb) {
						cb(v);
					}
				});
			}
		};
		var default_path = this.nsloader.cfg.get('default_save_path');

		function _move_file(default_path) {
			if (!default_path) {
				default_path = ithis.download_file_path;
			}
			const file_dirs = dialog.showOpenDialog({
				title: '选择' + ithis.task.filename + '迁移目录',
				buttonLabel: '迁移',
				defaultPath: default_path,
				properties: ['openDirectory']
			});
			console.log('move_file target file_dir:', file_dirs);
			if (file_dirs && file_dirs.length > 0 && fs.existsSync(file_dirs[0])) {
				var file_dir = file_dirs[0];
				var new_file_path = path.join(file_dir, ithis.task.filename);
				console.log('new_file_path:', new_file_path);
				if (!fs.existsSync(new_file_path)) {
					var final_file = path.join(ithis.download_file_path, ithis.task.filename);
					// console.log('copy final_file:', final_file, ' [to] ', new_file_path);
					if (fs.existsSync(final_file)) {
						ithis.nsloader.cfg.update('default_save_path', file_dir, 'last_open_dir', (p) => {
							fs.rename(final_file, new_file_path, (err) => {
								if (err) {
									console.log('err:', err);
									var err_info = 'error:迁移失败!<br>';
									for (var k in err) {
										err_info += k + ':' + err[k] + "<br>";
									}
									ithis.nsloader.send({
										'tag': 'alert',
										'msg': err_info
									});
									// if(cb){cb(1);}
									final_call(1);
								} else {
									// if(cb){cb(0);}
									final_call(0);
									fs.rmdirSync(ithis.download_file_path);
								}

							});
						});
						// ithis.account.update_default_save_path(file_dir);
					} else {
						ithis.nsloader.send({
							'tag': 'alert',
							'msg': '文件[' + ithis.task.filename + ']已经不存在!'
						});
					}
				} else {
					ithis.nsloader.send({
						'tag': 'alert',
						'msg': '存在同名文件,迁移失败!'
					});
					// if(cb){cb(1);}
					final_call(1);
				}
			} else {
				console.log('target file_dirs:', file_dirs, ', not exists!');
				// if(cb){cb(1);}
				final_call(1);
			}
		}
		_move_file(default_path);
	},
	compute_progress: function() {
		var self = this;
		var sub_task_list = [];
		var speed = '-K';
		var exhaust = '-S';
		var total_length = self.get_total_length();
		var total_file_size = self.get_download_size();
		var r = 0;
		if (total_file_size && total_length && total_length > 0) {
			r = helpers.build_percentage(total_file_size, total_length);
		}
		var prog_val = r;
		if (prog_val > 100) prog_val = 100;
		var st = self.get_state();

		if (this.last_get_size == 0) {
			this.last_get_size = total_file_size;
		} else {
			this.total_seconds += 1;
			self.counter += 1;
			if (self.counter >= max_counter) {
				this.last_get_size = total_file_size;
				self.counter = 0;
			} else if (total_file_size >= this.last_get_size) {
				if (self.counter >= min_counter) {
					var real_speed = (total_file_size - this.last_get_size) / self.counter;
					if (real_speed > 0) {
						exhaust = Math.round((total_length - total_file_size) / real_speed) + 'S';
						self.exhaust = exhaust;
					}
					speed = helpers.scale_size(real_speed);
					self.speed = speed;
				}
			}
		}
		var file_url = null;
		if (st != 2) {
			if (st == 1) {
				var l = self.tasks.length;
				for (var i = 0; i < l; i++) {
					if (i < self.tasks.length) {
						var t = self.tasks[i];
						if (t && t.get_state() != 7 && t.size() > 0) {
							var prog_params = t.compute_progress();
							sub_task_list.push(prog_params);
						}
					}
				}
				sub_task_list.sort(function(st_a, st_b) {
					return st_b["start"] - st_a["start"];
				});
			}
		} else {
			var final_file = path.join(self.download_file_path, self.task.filename);
			if (fs.existsSync(final_file)) {
				file_url = final_file;
			}
			prog_val = 100;
		}

		return {
			'file_url': file_url,
			'prog_val': prog_val,
			'exhaust': self.exhaust,
			'speed': self.speed,
			'sub': sub_task_list,
			'task': self.task,
			'total_length': total_length,
			'get_size': self.get_download_complete_size()
		};
	}
});
/////////////////////////////////////////////////// NS LOADER
var nsloader = Base.extend({
	constructor: function(account, options) {
		if (options) {
			this.context = options.context;
			this.point = options.point;
			this.cfg = options.cfg;
			this.looper = options.looper;
			this.download_dir = this.cfg.get("download_dir");
			this.nsproxy = options.nsproxy;
		}
		this.account = account;
		this.user_id = '';
		this.parent_win = null;
		this.token = null;
		this.tasks = [];
		this.task_map = {};
	},
	send: function(args) {
		if (this.parent_win) {
			this.parent_win.send(args);
		}
	},
	random_ua: function() {
		// var os_ver = os.release();
		// var devices = this.cfg.get('devices');//['pc;pc-mac;10.13.6;macbaiduyunguanjia','pc;macos1;10.13.6;macbaiduyunguanjia','pc;cccone;10.13.6;macbaiduyunguanjia','pc;levis;10.13.6;macbaiduyunguanjia'];
		// var ver = '2.2';
		// var suf = ~~(Math.random() * 4);
		// ver = ver + '.' + suf;
		// var devices_idx = ~~(Math.random() * devices.length);
		// var ua = "netdisk;"+ver+";pc;"+devices[devices_idx]+";"+os_ver+";macbaiduyunguanjia";
		var ua = this.cfg.get_ua()
		return ua;
	},
	query_file_head: function(url, callback, ua) {
		var self = this;
		this.nsproxy.fetch_real_dlink({
			'dlink': url,
			'ua': ua
		}, (rs, item, params) => {
			if (rs) {
				callback(params['rdlink'], params);
			} else {
				// self.update_state(-1, (_id, _p)=>{

				// });
				callback(null, {
					info: "下载请求超时,请重新尝试!"
				})
			}
		});
	},
	pause: function(task_id, callback) {
		var self = this;
		if (self.task_map.hasOwnProperty(task_id)) {
			var nst = self.task_map[task_id];
			nst.pause(callback);
		}
	},
	resume: function(task_id, callback) {
		var self = this;
		if (self.task_map.hasOwnProperty(task_id)) {
			var nst = self.task_map[task_id];
			nst.emit_tag = function() {
				return true
			};
			nst.resume(callback);
		}
	},
	move_file: function(task_id, cb) {
		var self = this;
		if (self.task_map.hasOwnProperty(task_id)) {
			var _t = self.task_map[task_id];
			_t.move_file(() => {
				cb(true);
			});
		} else {
			cb(false);
		}
	},
	del: function(task_id, cb) {
		var self = this;
		var idx_list = [];
		var _t = this.task_map[task_id];
		console.log("ns loader del main task_id:", task_id);
		if (_t) {
			_t.del(() => {
				var dirty_tasks = [_t];
				console.log('_t:', _t);
				for (var i = 0; i < self.tasks.length; i++) {
					var t = self.tasks[i];
					console.log('t task:', t.task);
					if (_t.task.id == t.task.id) {
						idx_list.push(i)
					}
				}
				if (idx_list && idx_list.length > 0) {
					var re_patch_tasks = [];
					idx_list.sort().reverse();
					idx_list.forEach((idx, _) => {
						var dirty_t = null;
						var dirty_ts = self.tasks.splice(idx, 1);
						if (dirty_ts.length > 0) {
							dirty_t = dirty_ts[0]
						}
						if (dirty_t && dirty_tasks.indexOf(dirty_t) < 0) {
							console.log('will put back task id:', dirty_t.task.id);
							re_patch_tasks.push(t);
						} else {
							console.log('will del task:', t.id, ',task_id:', task_id);
							delete self.task_map[t.id];
						}
					});
					if (re_patch_tasks.length > 0) {
						re_patch_tasks.forEach((r_t, _) => {
							self.tasks.push(r_t);
						});
					}
				}
				if (cb) cb();
			});
		}
	},
	new_download_nstask: function(item, callback) {
		var self = this;
		var task = {
			'id': item['fs_id'],
			'item_id': item['id'],
			// 'md5_val': item['md5_val'], 
			'state': 0,
			'fuzzy_id': self.user_id,
			'filename': item['filename'],
			// 'type':item['type'], 
			'source': item['source'],
			'tm': helpers.now()
		};
		var final_call = (isnew, nst) => {
			if (callback) {
				callback(isnew, nst);
			}
			setTimeout(() => {
				nst.init_dlink(() => {
					nst.update_state(1, (id, params) => {
						console.log('new_download_nstask id:', id, ', params:', params);
						nst.emit_tag = function() {
							return true
						};
						// if(isnew){

						// } else {

						// }
						console.log('new download nstask will active tasks!!!!');
						nst.active_tasks();
					});
				});
			}, 1);
		};
		var id = task.id;
		this.recover_nstask(task, (isnew, nst) => {
			console.log("recover_nstask return isnew:", isnew);
			// console.log("recover_nstask return nst:", nst.task);
			if (isnew) {
				nst.save_task(() => {
					final_call(isnew, nst);
				});
			} else {
				final_call(isnew, nst);
			}

		});
	},
	_parse_task_state: function(nst, callback) {
		var pos = 4;
		var result = {
			'state': 0,
			'pos': pos
		};
		console.log('_parse_task_state state:', nst.get_state());
		if (nst.get_state() == 0) {
			nst.init_dlink(() => {
				nst.update_state(1, (id, params) => {
					console.log('id:', id, ', params:', params, ',state:', nst.get_state());
					callback(false, result);
				});
			});
		} else if (nst.get_state() == 1) {
			pos = 5;
			result = {
				'state': 0,
				'pos': pos
			};
			callback(false, result);
		} else if (nst.get_state() == 2) {
			pos = 6;
			result = {
				'state': 0,
				'pos': pos
			};
			callback(false, result);
		} else if (nst.get_state() == -1) {
			result = {
				'state': -101,
				'pos': pos,
				'err': '网络访问故障!'
			};
			callback(false, result);
		} else {
			result = {
				'state': 0,
				'pos': pos
			};
			callback(false, result);
		}
	},
	_check_task_exist_by_source_fs_id: function(fs_id) {
		var self = this;
		if (self.task_map.hasOwnProperty(fs_id)) {
			var nst = self.task_map[fs_id];
			return nst;
		}
		for (var _fsid in self.task_map) {
			var nst = self.task_map[_fsid];
			if (nst.task.source == fs_id) {
				return nst;
			}
		}
		return null;
	},
	new_download_ready: function(data, callback) {
		var self = this;
		var task_id = data.fs_id;
		console.log('new_download_ready task_id:', task_id);
		var has_nst = self._check_task_exist_by_source_fs_id(task_id);
		if (has_nst) {
			var nst = has_nst;
			self._parse_task_state(nst, callback);
		} else {
			self.account.check_state((isok, rs) => {
				console.log('checkcopyfile data:', data);
				service.server_get(rs.tk, 'product/checkcopyfile', data, (err, raw) => {
					if (!err) {
						var body = JSON.parse(raw);
						var st = body.state;
						var fail = true;
						if (st < 0) {
							//需要先绑定baidu账号
							console.log("logic failed:", body.err);
						} else {
							//success
							fail = false;
						}
						var item = body['item'];
						var _rs = {
							'state': body['state'],
							'pos': body['pos'],
							'item': item
						};
						for (var k in body) {
							_rs[k] = body[k];
						}
						if (body['state'] == 0 && body['pos'] == 4 && item) {
							console.log('new_download_ready success item:', item);
							self.new_download_nstask(item, (r, nst) => {
								callback(fail, _rs);
							});
						} else {
							callback(fail, _rs);
						}
						// self.send({'tag':'tree', 'id':args.id, 'data': body, 'fail': fail, 'cmd':"download"});
						console.log("raw:", raw);
					}
				});
			});
		}
	},
	check_ready_state: function(data, callback) {
		var self = this;
		var task_id = data.fs_id;
		console.log('check_ready_state task_id:', task_id);
		var has_nst = self._check_task_exist_by_source_fs_id(task_id);
		if (has_nst) {
			var nst = has_nst;
			self._parse_task_state(nst, callback);
		} else {
			console.log('nsloader check_ready_state in:', task_id);
			self.nsproxy.check_ready_state((failed, _rs, body) => {
				if (body) {
					var item = body['item'];
					if (body['state'] == 0 && body['pos'] == 4 && item) {
						console.log('check_ready_state success item:', item);
						self.new_download_nstask(item, (r, nst) => {
							callback(false, _rs);
						});
					} else {
						callback(false, _rs);
					}
				} else {
					callback(true, _rs);
				}
			});
			// self.account.check_state((isok, rs)=>{
			// 	service.server_get(rs.tk, 'async/checkstate', {}, (err, raw)=>{
			// 		if(!err){
			// 			var body = JSON.parse(raw);
			// 			console.log("check_ready_state body:", body);
			// 			var rs = {};
			// 			for(var k in body){
			// 				rs[k] = body[k];
			// 			}
			// 			var item = body['item'];
			// 			if(body['state'] == 0 && body['pos'] == 4 && item){
			// 				console.log('check_ready_state success item:', item);
			// 				self.new_download_nstask(item, (r, nst)=>{
			// 					callback(false, rs);
			// 				});
			// 			} else {
			// 				callback(false, rs);
			// 			}

			// 		}
			// 	});
			// });
		}
	},
	recover_nstask: function(task, callback) {
		var self = this;
		var id = task.id;
		if (self.task_map.hasOwnProperty(id)) {
			callback(false, self.task_map[id]);
		} else {
			new nstask(task, {
				onReady: (nst) => {
					self.tasks.push(nst);
					self.task_map[id] = nst;
					callback(true, nst);
				},
				context: self
			});
		}
	},
	correct: function(callback) {
		var self = this;
		self.account.check_state((isok, rs) => {
			if (isok) {
				var tk = rs.tk;
				self.user_id = rs.id;
				self.token = tk;
				var wheresql = "where state <= 3 and fuzzy_id='" + self.user_id + "' order by tm desc ";
				download_task_db.query_by_raw_sql(wheresql, (task_list) => {
					var init_task_list = [],
						dlink_ok_list = [],
						pause_task_list = [],
						running_task_list = [],
						over_task_list = [];
					helpers.iterator(task_list, (t, idx, cb) => {
						// console.log('iterator t:', t, ',idx:', idx);
						self.recover_nstask(t, (ok, nst) => {
							var st = nst.get_state();
							if (st == 0 && nst) {
								init_task_list.push(nst);
							} else if (st == 3 && nst) {
								pause_task_list.push(nst);
							} else if (st == 2 && nst) {
								over_task_list.push(nst);
							} else if (st == 1 && nst) {
								running_task_list.push(nst);
							}
							if (st < 0 || st == 1) {
								nst.update_state(0, (_id, _p) => {
									nst.recover(() => {
										cb(true);
									});
								});
							} else {

								nst.recover(() => {
									cb(true);
								});
							}
						});
					}, (isover, l) => {
						if (isover) {}
						callback({});
					});
				});
			} else {
				callback({
					"error_code": 1
				});
			}
		});
	},
	checkout_tasks: function() {
		var self = this;
		var datas = [];
		self.tasks.sort(function(t_a, t_b) {
			return t_b.task["tm"] - t_a.task["tm"];
		});
		self.tasks.forEach((t, idx) => {
			if (t && t.compute_progress && typeof(t.compute_progress) == 'function') {
				datas.push(t.compute_progress());
			}
		});
		console.log(
			"app_data_dir:", self.cfg.get("app_data_dir"),
			",data_dir:", self.cfg.get("data_dir"),
			",patch_data_dir:", self.cfg.get("patch_data_dir"),
			",download_dir:", self.cfg.get("download_dir")
		);
		return datas;
	},
	compute_progress: function() {
		var self = this;
		var task_list = [];
		self.tasks.forEach((t, idx) => {
			// if(t.get_state() == 1){
			// 	task_list.push(t.compute_progress());
			// }
			if (t && t.compute_progress && typeof(t.compute_progress) == 'function') {
				task_list.push(t.compute_progress());
			}
		});
		return task_list
	}
});
module.exports = nsloader;
