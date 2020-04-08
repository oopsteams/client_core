// const {session} = require('electron');
const helpers = require("./helper.core.js")
const Base = require("./base.js")
const Dao = require('./dao.js')
// var path = require('path');
// const os =  require('os');
var cookies_db = new Dao({'type':'list', 'name':'cookies',
'fields':[{name:"id", type:'VARCHAR', len:200},
	{name:"name", type:'VARCHAR', len:120},
	{name:"value", type:'VARCHAR', len:4096},
	{name:"domain", type:'VARCHAR', len:128},
	{name:"hostOnly", type:'INT'},
	{name:"path", type:'VARCHAR', len:1024},
	{name:"secure", type:'INT'},
	{name:"httpOnly", type:'INT'},
	{name:"session", type:'INT'},
	{name:"expirationDate", type:'INT'}
	]
});
// const cookie_cause={
// 	'explicit':'Cookie由消费者的行为直接改变。',
// 	'overwrite':'由于重写它的插入操作，cookie被自动删除。',
// 	'expired':'Cookie在过期时自动删除。',
// 	'evicted':'垃圾收集期间，Cookie被自动清除。',
// 	'expired-overwrite':'cookie已被过期的过期日期覆盖。'
// };
const fn_list = ['hostOnly', 'secure', 'httpOnly', 'session'];
var cookies = Base.extend({
	constructor:function(options){
		console.log('cookies begin!!!');
		this.options = options;
		this.parent = options?options.parent:null;
		this.point = options?options.point:null;
		this.changed = false;
		this.heart_delay_count = 0;
		console.log('cookies end!!!');
		this.db_tasks = [];
		this.is_running = false;
	},
	init:function(win, callback){
		var self = this;
		var final_call = ()=>{
			if(callback){
				callback();
			}
			self._listen(win);
		};
		cookies_db.query_by_raw_sql(' where 1=1 ', (items)=>{
			if(items){
				helpers.iterator(items, (item, idx, cb)=>{
					var c = self.filter_to_app(item);
					// console.log('will set cookie:', c);
					win.webContents.session.cookies.set(c, (err)=>{
						if(err){
							self.log('cookies set err:', err);
						}
						cb(true);
					});
				},(complete, pos)=>{
					final_call();
				});
			}
		});
		
	},
	filter_to_app:function(item){
		var c = {};
		if(item){
			
			for(var k in item){
				if(k == 'id'){
					continue;
				}
				var v = item[k];
				if(fn_list.indexOf(k) >= 0){
					if(v == 1){
						v = true;
					} else {
						v = false;
					}
				}
				c[k] = v;
			}
			var protocol = c.secure?'https://':'http://';
			var domain = c.domain;
			var url = protocol + domain.replace(/^\./, '') + c.path;
			c['url'] = url;
		}
		return c;
	},
	filter_to_db:function(cookie_obj){
		var params = {};
		if(cookie_obj){
			for(var k in cookie_obj){
				var v = cookie_obj[k];
				if(fn_list.indexOf(k) >= 0){
					if(v){
						v = 1;
					} else {
						v = 0;
					}
				}
				params[k] = v;
			}
		}
		return params;
	},
	del_cookie:function(cookie_obj, callback){
		// var self = this;
		if(cookie_obj){
			var id = cookie_obj['name']+'_'+cookie_obj['domain'];
			cookies_db.del('id', id, ()=>{
				if(callback){
					callback();
				}
			});
		}
	},
	update_cookie:function(callback){
		var self = this;
		if(self.is_running){
			return;
		}
		self.is_running = true;
		var final_call = ()=>{
			self.is_running = false;
			if(callback){
				callback();
			}
		};
		if(self.db_tasks && self.db_tasks.length>0){
			var cookie_obj_list = self.db_tasks;
			self.db_tasks = [];
			helpers.iterator(cookie_obj_list, (cookie_obj, idx, cb)=>{
				var id = cookie_obj['name']+'_'+cookie_obj['domain'];
				cookie_obj['id'] = id;
				var item = self.filter_to_db(cookie_obj);
				item['id'] = id;
				cookies_db.get('id', id, (c)=>{
					if(c){
						cookies_db.update_by_id(id, item, ()=>{
							cb(true);
						});
					} else {
						cookies_db.put(item, ()=>{
							cb(true);
						});
					}
				});
			}, (complete, pos)=>{
				final_call();
			});
		} else {
			final_call();
		}
	},
	_listen:function(win){
		var self = this;
		win.webContents.session.cookies.on("changed", (event, cookie, cause, removed)=>{
			if('explicit' == cause){ //Cookie由消费者的行为直接改变。
				this.db_tasks.push(cookie);
			} else if('overwrite' == cause){//由于重写它的插入操作，cookie被自动删除。
				this.db_tasks.push(cookie);
			} else if('expired' == cause){//Cookie在过期时自动删除。
				self.del_cookie(cookie);
			} else if('evicted' == cause){//垃圾收集期间，Cookie被自动清除。
				
			} else if('expired-overwrite' == cause){//cookie已被过期的过期日期覆盖。
				this.db_tasks.push(cookie);
			}
			// console.log('changed:', cookie);
			self.changed = true;
			self.update_cookie();
		});
		// self.log('log:','ok');
	},
	// log:function(){
	// 	var _args = [];
	// 	for(var idx in arguments){
	// 		_args[idx] = arguments[idx];
	// 	}
	// 	this.logger.log.apply(this.logger,_args);
	// },
	heart_call:function(){
		var self = this;
		self.heart_delay_count +=1;
		if(self.heart_delay_count >= 10){
			self.heart_delay_count = 0;
			self.sync();
		}
	},
	sync:function(){
		var self = this;
		// if(self.changed){
		// 	session.defaultSession.cookies.get({}, (error, cookie)=>{
		// 		// self.__super__.log(error, cookies);
			
		// 	});
		// }
		self.update_cookie();
	}
});

module.exports = cookies;