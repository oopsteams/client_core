const Base = require("./base.js")
const helpers = require("./helper.core.js")
const util = require('util');
// const sqlite3 = require('sqlite3').verbose();
const sqlite3 = {key: "sqlite3"};
// const os = require('os');
var path = require('path');
// var base_dir = os.homedir();
// var data_dir = path.join(base_dir, helpers.data_dir_name);
// const db_conn_timeout = 30 * 60 * 1000;
const db_conn_timeout = 15 * 60 * 1000;
const create_table_format = 'CREATE TABLE IF NOT EXISTS %s (%s)';
const create_table_index_format = 'CREATE INDEX IF NOT EXISTS index_%s ON %s (%s)';
var g_db_file_path = null; //path.join(data_dir, g_db_name);
var last_update_tm = helpers.now();
var g_db = null;
var looper_listener = (p) => {
	if (helpers.now() - last_update_tm >= db_conn_timeout) {
		// to close db.
		console.log('db连接闲置超时,需要重连!');
		if (g_db) Dao.close();
		g_db = build_db_inst(p.looper);
		last_update_tm = helpers.now();
	}
};
var build_db_inst = (looper, cb) => {
	if (g_db_file_path) {
		console.log('will open database:', g_db_file_path);
		g_db = new sqlite3.Database(g_db_file_path, function(err) {
			var rs = false;
			if (err) {
				g_db = new sqlite3.Database(g_db_file_path, (err) => {
					if (err) {
						throw err;
					} else {
						rs = true;
						console.log("创建DB成功!", g_db_file_path);
						if (looper) looper.addListener('sqlite3', looper_listener, {
							context: g_db,
							"looper": looper
						});
					}
				});
			} else {
				rs = true;
				console.log("创建DB成功!", g_db_file_path);
				if (looper) looper.addListener('sqlite3', looper_listener, {
					context: g_db,
					"looper": looper
				});
			}
			if (cb) {
				cb(rs);
			}
		});
	} else {
		if (cb) {
			cb(false);
		}
		if (looper) looper.addListener('sqlite3', looper_listener, {
			context: g_db,
			"looper": looper
		});
	}
	return g_db;
};

var before_call = () => {
	if (!g_db) {
		console.log('重建 db 链接!');
		g_db = build_db_inst();
	}
	last_update_tm = helpers.now();
};
var Dao = Base.extend({
	constructor: function(options) {
		this.options = options;
		this.path = options.path;
		this.type = options.type;
		this.name = options.name;
		this.db = g_db;
		this.fields = options.fields;
		this.id_field = null;
		console.log('init table name:', this.name);
		this.init();
	},
	init: function() {
		var ithis = this;
		var onInited = this.options.onInited;
		var check_miss_fields = function(_cb) {
			var check_sql = "PRAGMA table_info('" + ithis.name + "');";
			Promise.resolve().then(() => {
				ithis.db.all(check_sql, (err, fds) => {
					if (fds && fds.length > 0) {
						var need_patch_fields = [];
						var o_fd_map = {};
						fds.forEach(( of , idx) => {
							o_fd_map[ of .name] = of ;
						});
						ithis.fields.forEach((f, index) => {
							if (f.name != 'id' && !(f.name in o_fd_map)) {
								need_patch_fields.push(f);
							}
						});
					}
					if (need_patch_fields.length > 0) {
						helpers.iterator(need_patch_fields, (pf, idx, confirmcb) => {
							var pf_sql = "ALTER TABLE " + ithis.name + " ADD COLUMN ";
							pf_sql += "" + pf.name + " " + pf.type + (('len' in pf) ? "(" + pf.len + ")" : "");
							console.log(pf_sql);
							ithis.db.run(pf_sql, (err) => {
								if (err) {
									console.log('alter table err:', err);
								} else {
									if (pf.index) {
										var create_index_sql = util.format(create_table_index_format, pf.name, ithis.name, pf.name);
										ithis.db.run(create_index_sql, (err) => {
											confirmcb(true);
										});
									} else {
										confirmcb(true);
									}
								}
							});
						}, (iscomplete, pos) => {
							if (_cb) _cb();
						});
					} else {
						if (_cb) _cb();
					}
				});
			});

		};
		if (this.fields) {
			var indexs_fields = [];
			var fields_tokens = "";
			this.fields.forEach((f, index) => {
				if (fields_tokens.length > 0) {
					fields_tokens += ",";
				}
				// console.log('f:', f.name, f.type);
				var suffix = "";
				if (f.name == 'id') {
					ithis.id_field = f;
					suffix = " PRIMARY KEY";
				}
				fields_tokens += "" + f.name + " " + f.type + (('len' in f) ? "(" + f.len + ")" : "") + suffix;
				if (f.index) {
					indexs_fields.push(f.name);
				}
			});
			// console.log("fields_tokens:",fields_tokens);
			var create_sql = util.format(create_table_format, this.name, fields_tokens);
			console.log('create_sql:', create_sql);
			this.db.run(create_sql, (err) => {
				check_miss_fields();
				if (indexs_fields.length > 0) {
					helpers.iterator(indexs_fields, (field_name, idx, cb) => {
						var create_index_sql = util.format(create_table_index_format, field_name, ithis.name, field_name);
						ithis.db.run(create_index_sql, (err) => {
							cb(true);
						});
					}, (iscomplete, pos) => {
						console.log('will call onInited.', onInited);
						if (onInited) {
							onInited();
						}
					});
				} else {
					console.log('will call onInited.', onInited);
					if (onInited) {
						onInited();
					}
				}
			});
			//CREATE INDEX index_name ON table_name (column_name);
		} else {
			if (onInited) {
				onInited();
			}
		}
	},
	find_field_by_name: function(name) {
		for (var i = 0; i < this.fields.length; i++) {
			var f = this.fields[i];
			if (f.name == name) {
				return f;
			}
		}
	},
	sqlite_escape: function(val) {
		if (val) {
			var reg = new RegExp("'", "g");
			val = ('' + val).replace(reg, "''");
		}
		return val;
	},
	format_val_by_type: function(f, val, suffix_str) {
		if (!suffix_str) {
			suffix_str = '';
		}
		if (f.type == 'INT') {
			return util.format('%d', val);
		} else if (f.type == 'BIGINT') {
			var s = val.toPrecision(64);
			var idx = s.indexOf('.');
			if (idx >= 0) {
				s = s.substring(0, idx);
			}
			return s;
		} else if (f.type == 'REAL') {
			return val.toPrecision(64);
		} else if (f.type == 'VARCHAR') {
			if (!val) {
				val = '';
			} else {
				val = this.sqlite_escape(val);
			}
			return util.format("'%s%s'", val, suffix_str);
		} else if (f.type == 'CHAR') { // 存储YYYY-MM-DD HH:MM:SS格式的日期
			if (!val) {
				val = '1982-01-03 00:00:00';
			}
			return util.format("'%s%s'", val, suffix_str);
		} else if (f.type == 'TEXT') { // 存储YYYY-MM-DD HH:MM:SS.SSS格式的日期
			if (!val) {
				val = '1982-01-03 00:00:00';
			}
			val = this.sqlite_escape(val);
			return util.format("'%s%s'", val, suffix_str);
		} else if (f.type == 'DATETIME') {
			return util.format("'%s'", val);
		}
	},
	mapping_to_insert_sql: function(item) {
		var f_n_list = [];
		var val_list = [];
		if (item) {
			for (var i = 0; i < this.fields.length; i++) {
				var f = this.fields[i];
				if (f.name in item) {
					var _v = this.format_val_by_type(f, item[f.name]);
					if (_v) {
						f_n_list.push(f.name);
						val_list.push(_v);
					}
				}
			}
		}
		return {
			fn: f_n_list,
			vals: val_list
		}
	},
	put: function(item, cb) {
		var ithis = this;
		before_call.apply(ithis);
		var mapping_list = this.mapping_to_insert_sql(item);
		// console.log('put mapping_list:', mapping_list);
		// console.log('put item:', item);
		var inst_sql = 'insert into ' + this.name + '(' + mapping_list.fn.join(',') + ') values(' + mapping_list.vals.join(
			',') + ')';
		// console.log('put inst_sql:',inst_sql);
		if ("list" == this.type) {
			// this.db.get(this.name).push(item).write()
			if (item) {
				ithis.db.run(inst_sql, (err) => {
					if (err != null) {
						console.log("err, inst_sql:", inst_sql);
						throw err;
					}
					if (cb) {
						cb(item);
					}
				});
			} else {
				cb(item);
			}
		} else {
			var query_rows = "select * from " + this.name;
			this.db.get(query_rows, (err, row) => {
				if (err != null) {
					throw err;
				}
				if (row) {
					console.log("find row:", row);
					var id = row.id;
					ithis.update_by_id(id, item, cb);
				} else {
					console.log('not found user row,inst_sql:', inst_sql);
					ithis.db.run(inst_sql, (err) => {
						if (err != null) {
							throw err;
						}
						if (cb) {
							cb(item);
						}
					});
				}
			});
			// this.db.get(this.name).assign(item).write();
		}
	},
	update_by_conditions_increment: function(conditions, params, increment_fields, cb) {
		var ithis = this;
		before_call.apply(ithis);
		var where_str = '';
		for (var k in conditions) {
			var _f = this.find_field_by_name(k);
			var value = conditions[k];
			if (_f) {
				if (where_str.length == 0) {
					where_str = k + "=" + this.format_val_by_type(_f, value);
				} else {
					where_str += " and " + k + "=" + this.format_val_by_type(_f, value);
				}
			}
		}
		if (where_str.length == 0) {
			cb(conditions, params);
			return;
		}
		var mapping_list = this.mapping_to_insert_sql(params);
		var set_sql = "";
		mapping_list.fn.forEach((fn, idx) => {
			if (fn != 'id') {
				if (set_sql.length > 0) set_sql += ",";
				set_sql += fn + "=" + mapping_list.vals[idx];
			}
		});
		if (increment_fields) {
			for (var f in increment_fields) {
				var v = increment_fields[f];
				if (v != 0) {
					if (set_sql.length > 0) set_sql += ",";
					if (v > 0) {
						set_sql += f + "=" + f + "+" + v;
					} else {
						set_sql += f + "=" + f + v;
					}
				}
			}
		}
		var up_sql = "update " + this.name + " set " + set_sql + " where " + where_str;
		this.db.run(up_sql, (err) => {
			if (err != null) {
				console.log("err, update_by_conditions up_sql:", up_sql);
				throw err;
			}
			if (cb) {
				cb(conditions, params);
			}
		});
	},
	update_by_conditions: function(conditions, params, cb) {
		// var ithis = this;
		this.update_by_conditions_increment(conditions, params, null, cb);
	},
	update_by_id: function(id, params, cb) {
		before_call.apply(this);
		var mapping_list = this.mapping_to_insert_sql(params);
		var set_sql = "";
		var db_id_val = id;
		if (this.id_field) {
			db_id_val = this.format_val_by_type(this.id_field, id);
		}
		mapping_list.fn.forEach((fn, idx) => {
			if (fn != 'id') {
				if (set_sql.length > 0) set_sql += ",";
				set_sql += fn + "=" + mapping_list.vals[idx];
			}
		});
		var up_sql = "update " + this.name + " set " + set_sql + " where id=" + db_id_val;
		// console.log("update_by_id up_sql:",up_sql);
		this.db.run(up_sql, (err) => {
			if (err != null) {
				console.log("err, update_by_id up_sql:", up_sql);
				throw err;
			}
			if (cb) {
				cb(id, params);
			}
		});
		// if("list" == this.type){
		// 	this.db.get(this.name).find({'id': id}).assign(params).write()
		// } else {
		// 	this.db.get(this.name).assign(params).write();
		// }
	},
	get: function(key, value, cb) {
		before_call.apply(this);
		var ithis = this;
		var query_rows = null;
		if (key && value) {
			var _f = this.find_field_by_name(key);
			query_rows = "select * from " + this.name + " where " + key + "=" + this.format_val_by_type(_f, value);
			// console.log("get query_rows:", query_rows);
			ithis.db.get(query_rows, (err, row) => {
				if (cb) {
					if (row) {
						cb(row);
					} else {
						cb(null);
					}
				}
			});
		} else {
			query_rows = "select * from " + this.name;
			ithis.db.get(query_rows, (err, row) => {
				if (err != null) {
					throw err;
				}
				// console.log("cb err, row:", err, row);
				if (cb) {
					if (row) {
						cb(row);
					} else {
						cb(null);
					}
				}
			});
		}
	},
	query: function(key, value, cb) {
		before_call.apply(this);
		var ithis = this;
		var _f = this.find_field_by_name(key);
		var query_rows = "select * from " + this.name + " where " + key + "=" + this.format_val_by_type(_f, value);
		// console.log("query query_rows:",query_rows);
		ithis.db.all(query_rows, (err, rows) => {
			if (err != null) {
				console.log("err, query_rows:", query_rows);
				throw err;
			}
			if (cb) {
				cb(rows);
			}
		});

	},
	query_count: function(params, cb) {
		before_call.apply(this);
		var ithis = this;
		var where_str = '';
		for (var k in params) {
			var _f = this.find_field_by_name(k);
			var value = params[k];
			if (_f) {
				if (where_str.length == 0) {
					where_str = k + "=" + this.format_val_by_type(_f, value);
				} else {
					where_str += " and " + k + "=" + this.format_val_by_type(_f, value);
				}
			}
		}
		var query_rows = "select count(*) as cnt from " + this.name + " where " + where_str;
		ithis.db.get(query_rows, (err, row) => {
			if (err != null) {
				console.log("err, query_rows:", query_rows);
				throw err;
			}
			if (cb) {
				cb(row);
			}
		});
	},
	query_sum: function(key, params, cb) {
		before_call.apply(this);
		var ithis = this;
		var where_str = '';
		for (var k in params) {
			var _f = this.find_field_by_name(k);
			var value = params[k];
			if (_f) {
				if (where_str.length == 0) {
					where_str = k + "=" + this.format_val_by_type(_f, value);
				} else {
					where_str += " and " + k + "=" + this.format_val_by_type(_f, value);
				}
			}
		}
		var query_rows = "select sum(" + key + ") as val from " + this.name + " where " + where_str;
		ithis.db.get(query_rows, (err, row) => {
			if (err != null) {
				console.log("err, query_rows:", query_rows);
				throw err;
			}
			if (cb) {
				cb(row);
			}
		});
	},
	query_by_distinct: function(keys, params, cb) {
		before_call.apply(this);
		var ithis = this;
		var where_str = '';
		for (var k in params) {
			var _f = this.find_field_by_name(k);
			var value = params[k];
			if (_f) {
				if (where_str.length == 0) {
					where_str = k + "=" + this.format_val_by_type(_f, value);
				} else {
					where_str += " and " + k + "=" + this.format_val_by_type(_f, value);
				}
			}
		}
		var keys_str = '';
		keys.forEach((k, idx) => {
			if (idx == 0) {
				keys_str = k
			} else {
				keys_str += ',' + k
			}
		});
		var query_rows = "select " + keys_str + " from " + this.name + " where " + where_str + " group by " + keys_str;
		ithis.db.all(query_rows, (err, rows) => {
			if (err != null) {
				console.log("err, query_rows:", query_rows);
				throw err;
			}
			if (cb) {
				cb(rows);
			}
		});
	},
	query_mult_params: function(params, cb, size, offset, orderby) {
		before_call.apply(this);
		var ithis = this;
		var where_str = '';
		if (!orderby) {
			orderby = '';
		}
		if (!offset) {
			offset = 0;
		}
		if (!size) {
			size = 50;
		}
		for (var k in params) {
			var _f = this.find_field_by_name(k);
			var value = params[k];
			if (_f) {
				if (where_str.length == 0) {
					where_str = k + "=" + this.format_val_by_type(_f, value);
				} else {
					where_str += " and " + k + "=" + this.format_val_by_type(_f, value);
				}
			}
		}
		if (where_str.length == 0) {
			cb([]);
			return;
		}
		var query_rows = "select * from " + this.name + " where " + where_str + " " + orderby + " LIMIT " + size +
			" OFFSET " + offset;
		// console.log("query query_rows:",query_rows);
		ithis.db.all(query_rows, (err, rows) => {
			if (err != null) {
				console.log("err, query_rows:", query_rows);
				throw err;
			}
			if (cb) {
				cb(rows);
			}
		});

	},
	update_by_raw_sql: function(sql, cb) {
		before_call.apply(this);
		var ithis = this;
		if (sql) {
			ithis.db.run(sql, (err, result) => {
				if (err != null) {
					console.log("err, update_by_raw_sql:", sql);
					throw err;
				}
				if (cb) {
					cb(result);
				}
			});
		} else {
			if (cb) {
				cb([]);
			}
		}
	},
	query_by_raw_sql: function(wheresql, cb) {
		before_call.apply(this);
		var ithis = this;
		if (wheresql) {
			var sql = "select * from " + this.name;
			var _wsql = wheresql.trim();
			var where_idx = _wsql.indexOf('where');
			if (where_idx == 0) {
				sql += " " + wheresql;
			} else if (where_idx < 0) {
				sql += " where " + wheresql;
			} else {
				sql = wheresql;
			}
			ithis.db.all(sql, (err, rows) => {
				if (err != null) {
					console.log("err, query_by_raw_sql:", sql);
					throw err;
				}
				if (cb) {
					cb(rows);
				}
			});
		} else {
			if (cb) {
				cb([]);
			}
		}
	},
	query_start_with_params: function(params, cb, size, offset) {
		before_call.apply(this);
		var ithis = this;
		var where_str = '';
		if (!offset) {
			offset = 0;
		}
		if (!size) {
			size = 50;
		}
		for (var k in params) {
			var _f = this.find_field_by_name(k);
			var value = params[k];
			if (_f) {
				var suffix_str = "=" + this.format_val_by_type(_f, value);
				if (['VARCHAR', 'CHAR', 'TEXT'].indexOf(_f.type) >= 0) {
					suffix_str = " like " + this.format_val_by_type(_f, value, '%');
				}
				if (where_str.length == 0) {
					where_str = k + suffix_str;
				} else {
					where_str += " and " + k + suffix_str;
				}
			}
		}
		if (where_str.length == 0) {
			cb([]);
			return;
		}
		var query_rows = "select * from " + this.name + " where " + where_str + " LIMIT " + size + " OFFSET " + offset;
		// console.log("query query_rows:",query_rows);
		ithis.db.all(query_rows, (err, rows) => {
			if (err != null) {
				console.log("err, query_rows:", query_rows);
				throw err;
			}
			if (cb) {
				cb(rows);
			}
		});

	},
	save_list_one_by_one: function(item_list, conflict_check_cb, mapping, cb) {
		before_call.apply(this);
		var self = this;

		function save_by_check(pos, tag) {
			// console.log('save_by_check in pos:', pos, ',tag:', tag);
			if (pos >= item_list.length) {
				cb(item_list);
				return;
			}
			var _item = mapping(item_list[pos]);
			if (_item && 'id' in _item) {
				self.get('id', _item.id, (_get_item) => {
					// console.log('_item id:',_item.id,',get item:',_get_item, ',pos:',pos);
					if (!_get_item) {
						self.put(_item, () => {
							setTimeout(() => {
								save_by_check(pos + 1, 'new item with id!');
							}, 10);
						});
					} else {
						if (conflict_check_cb) {
							conflict_check_cb(_item, _get_item, (update_it) => {
								if (update_it) {
									if ('id' in update_it) {
										delete update_it['id'];
									}
									self.update_by_id(_item.id, update_it, () => {
										save_by_check(pos + 1, 'update item by id!');
									});
								} else {
									save_by_check(pos + 1, 'skip update item!');
								}
							});
						} else {
							save_by_check(pos + 1, 'skip update item!');
						}
					}
				});
			} else if (_item) {
				self.put(_item, () => {
					setTimeout(() => {
						save_by_check(pos + 1, 'new item without id!');
					}, 1);
				});
			} else {
				save_by_check(pos + 1, 'skip item!');
			}
		}
		save_by_check(0);
	},
	del_all: function(cb) {
		before_call.apply(this);
		var del_sql = "delete from " + this.name;
		this.db.run(del_sql, (err, rows) => {
			if (err != null) {
				throw err;
			}
			if (cb) {
				cb(rows);
			}
		});
	},
	del: function(key, value, cb) {
		before_call.apply(this);
		var _f = this.find_field_by_name(key);
		var del_sql = "delete from " + this.name + " where " + key + "=" + this.format_val_by_type(_f, value);
		// console.log("del query_rows:",del_sql);
		this.db.run(del_sql, (err, rows) => {
			if (err != null) {
				throw err;
			}
			if (cb) {
				cb(rows);
			}
		});
	},
	close: function() {}
});
Dao.close = () => {
	try {
		// g_db.close();
	} catch (e) {}
};
Dao.initDatabase = (data_dir, looper, callback) => {
	var g_db_name = '.datas';
	g_db_file_path = path.join(data_dir, g_db_name);
	build_db_inst(looper, callback);
};
module.exports = Dao;
