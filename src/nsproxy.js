const helpers = require("./helper.core.js")
const Base = require("./base.js")
const Dao = require('./dao.js')
const service = require('./service.js')

var item_dao = new Dao({
	'type': 'list',
	'name': 'item_cache',
	'fields': [{
			name: "id",
			type: 'VARCHAR',
			len: 16
		},
		{
			name: "created_at",
			type: 'CHAR',
			len: 19
		},
		{
			name: "updated_at",
			type: 'CHAR',
			len: 19
		},
		{
			name: "category",
			type: 'INT'
		},
		{
			name: "isdir",
			type: 'INT'
		},
		{
			name: "filename",
			type: 'VARCHAR',
			len: 512
		},
		{
			name: "dlink",
			type: 'VARCHAR',
			len: 1024
		},
		{
			name: "mlink",
			type: 'VARCHAR',
			len: 1024
		},
		{
			name: "thumb",
			type: 'VARCHAR',
			len: 1024
		},
		{
			name: "start_at_time",
			type: 'INT'
		},
		{
			name: "fs_id",
			type: 'VARCHAR',
			len: 20,
			index: true
		},
		{
			name: "path",
			type: 'VARCHAR',
			len: 1024
		},
		{
			name: "size",
			type: 'INT'
		},
		{
			name: "md5_val",
			type: 'VARCHAR',
			len: 64
		},
		{
			name: "parent",
			type: 'VARCHAR',
			len: 16
		},
		{
			name: "dlink_updated_at",
			type: 'CHAR',
			len: 19
		},
		{
			name: "pin",
			type: 'INT'
		},
		{
			name: "server_ctime",
			type: 'INT'
		},
		{
			name: "account_id",
			type: 'INT'
		},
		{
			name: "type",
			type: 'VARCHAR',
			len: 10
		},
		{
			name: "t",
			type: 'INT'
		}
	]
});

function get_from_cache(id, cb) {
	// cb(null);
	// return;
	item_dao.get('id', id, (_item) => {
		if (_item) {
			if (helpers.now() - _item.t > 6 * 60 * 60 * 1000) {
				item_dao.del('id', id, () => {
					cb(null);
				});
			}
			console.log('cache hit!');
			cb(_item);
		} else {
			cb(null);
		}
	});
}

function put_to_cache(id, item, cb) {
	item['t'] = helpers.now();
	item_dao.get('id', id, (_item) => {
		if (_item) {
			item_dao.update_by_id(id, item, cb)
		} else {
			console.log('id:', id, ',id item:', item.id);
			if (item.id) {
				setTimeout(() => {
					item_dao.get('id', item.id, (__item) => {
						if (__item) {
							item_dao.update_by_id(id, item, cb);
						} else {
							item_dao.put(item, cb);
						}
					});
				}, 1);
			} else {
				item_dao.put(item, cb);
			}
		}
	});
	// _item = db.get('item_cache').push(item).write()
}

var nsproxy = Base.extend({
	constructor: function(account, options) {
		this.parent = options ? options.parent : null;
		this.point = options ? options.point : null;
		this.account = account;
	},
	fetch_real_dlink: function(item, callback) {
		var fetch_by_net = function(dlink, _cb) {
			var ua = null;
			if (item.hasOwnProperty('ua') && item.ua) {
				ua = item.ua;
			}
			var _options = {};
			if (ua) {
				_options['ua'] = ua;
			}
			service.server_get_header(dlink, (err, code, header) => {
				// console.log("header:", header);
				if (!err) {

				} else {
					console.log('err:', err);
				}
				if (_cb) _cb(code, header);
			}, _options);
		}
		var try_cnt = 0;
		var to_fetch = (dlink, cb) => {
			fetch_by_net(dlink, (code, header) => {
				if (code == 302) {
					try_cnt = 0;
					var loc = header.location;
					to_fetch(loc, cb);
				} else {
					if (code >= 400 && try_cnt <= 50) {
						try_cnt = try_cnt + 1;
						var dl = try_cnt * 1000;
						if (dl > 8000) dl = 8000;
						setTimeout(() => {
							to_fetch(dlink, cb);
						}, 1000);
					} else if (code == 200) {
						var contentType = header['content-type'];
						item.dlink = dlink;
						item['type'] = contentType;
						var accept_ranges = header['accept-ranges'];
						var content_length = header['content-length'];
						if (content_length) {
							content_length = parseInt(content_length);
						}
						var params = {
							rdlink: dlink,
							type: contentType,
							length: content_length,
							ranges: accept_ranges
						}
						if (cb) {
							cb(true, params);
						}
					} else {
						if (cb) {
							cb(false);
						}
					}

					// console.log("fetch_file_info finish code:", code);
					// console.log("fetch_file_info finish header:", header);
				}
			});
		};
		var dlink = item.dlink;
		to_fetch(dlink, (success, params) => {
			callback(success, item, params);
		});
	},
	fetch_file_info: function(item_id, callback) {
		this.fetch_file_view_info(item_id, true, callback);
	},
	fetch_file_view_info: function(item_id, fetch_real_url, callback) {
		var self = this;
		var final_call = function(params) {
			if (params.error_code) {
				console.error(helpers.error_codes(params.error_code))
				callback({
					'id': item_id,
					'item': null,
					"msg": helpers.error_codes(params.error_code)
				});
			} else {
				var item = params['item'];
				var dlink = item.dlink;
				if (item.pin == 0) {
					if (fetch_real_url) {
						self.fetch_real_dlink(item, (succ, _item) => {
							_item.pin = 1;
							put_to_cache(item_id, _item, () => {
								callback({
									'id': item_id,
									'item': _item
								})
							});
						});
					} else {
						put_to_cache(item_id, item, () => {
							callback({
								'id': item_id,
								'item': item
							})
						});
					}
				} else {
					callback({
						'id': item_id,
						'item': item
					})
				}
			}
		};
		var fetch_by_req = (tk) => {
			service.server_get(tk, 'source/finfo', {
				id: item_id
			}, (err, raw) => {
				var body = JSON.parse(raw);
				// console.log("body:", body);
				if (body && body.hasOwnProperty('item')) {
					var item = body['item'];
					item['pin'] = 0;
					// put_to_cache(item_id, _item);
					final_call({
						'id': item_id,
						'item': item
					})
				} else {
					final_call({
						"error_code": 3
					});
				}
			}, {
				error: (e) => {
					final_call({
						"error_code": 2
					});
				}
			});
		};
		self.account.check_state((isok, rs) => {
			if (isok) {
				var tk = rs.tk;
				get_from_cache(item_id, (item) => {
					if (item) {
						console.log('cache item:', item.id, ',filename:', item.filename, ',fs_id:', item.fs_id);
						final_call({
							'id': item_id,
							'item': item
						});
						return;
					} else {
						fetch_by_req(tk);
					}
				})
			} else {
				final_call({
					"error_code": 1
				})
			}
		});
	},
	transfer_ready: function(data, callback) {
		var self = this;
		self.account.check_state((isok, rs) => {
			console.log('checkcopyfile data:', data);
			service.server_get(rs.tk, 'product/checktransferfile', data, (err, raw) => {
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
					callback(fail, _rs);
				} else {
					callback(true, {
						"err": "网络服务异常!",
						"state": -1
					});
				}
			});
		});
	},
	check_ready_state: function(callback) {
		var self = this;
		self.account.check_state((isok, rs) => {
			service.server_get(rs.tk, 'async/checkstate', {}, (err, raw) => {
				if (!err) {
					var body = JSON.parse(raw);
					// console.log("check_ready_state body:", body);
					var _rs = {};
					for (var k in body) {
						_rs[k] = body[k];
					}
					if (callback) {
						callback(false, _rs, body);
					}
				} else {
					callback(true, {
						"err": "网络服务异常!",
						"state": -1
					}, null);
				}
			});
		});
	}
});
module.exports = nsproxy;
