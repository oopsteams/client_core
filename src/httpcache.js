const {nativeImage} = require('electron');
const Dao = require('./dao.js');
const md5 = require('js-md5');
const fs = require('fs');
const path = require('path');
const helpers = require("./helper.core.js");
const service = require('./service.js');
var cache_db = new Dao({'type':'list', 'name':'cachelog',
'fields': [{
				name: "id",
				type: 'VARCHAR',
				len: 20
			},
			{
				name: "position",
				type: 'VARCHAR',
				len: 64
			},
			{
				name: "expired",
				type: 'INT',
				index:true
			},
			{
				name: "tm",
				type: 'INT'
			}
		],
		onInited: function() {
		}
});

var httpcache = {
	scheme:"cache",
	default_img:null,
	dir:"",
	guess_type:function(accept){
		if(accept.match(/image/i)){
			return "image";
		}
		return "plain";
	},
	check_cache_file:function(item){
		if(item){
			var id = item.id;
			var position = item.position;
			var cache_path = path.join(httpcache.dir, position);
			if (fs.existsSync(cache_path)) {
				var cache_file_path = path.join(cache_path, id);
				if (fs.existsSync(cache_file_path)) {
					return cache_file_path;
				}
			}
		}
		return null;
	},
	remove_cache_file:function(item){
		if(item){
			var id = item.id;
			var position = item.position;
			var cache_path = path.join(httpcache.dir, position);
			if (fs.existsSync(cache_path)) {
				var cache_file_path = path.join(cache_path, id);
				if (fs.existsSync(cache_file_path)) {
					fs.unlinkSync(cache_file_path);
				}
			}
		}
	},
	sync_from_remote:function(ori_url, key, params, callback){
		var position = params.position;
		var cache_path = path.join(httpcache.dir, position);
		if (!fs.existsSync(cache_path)) {
			fs.mkdirSync(cache_path);
			// console.log('mkdir cache_path:', cache_path);
		}
		var cache_file_path = path.join(cache_path, key);
		// console.log('sync_from_remote will download_lib_file:',ori_url, ', cache_file_path:',cache_file_path);
		service.download_lib_file(cache_file_path, ori_url, (err, fpath) => {
			// console.log('fpath:', fpath);
			if(!err){
				var n = helpers.snow();
				var timeout = params.timeout;
				var expired = 0;
				if(timeout>0){
					expired = n + timeout;
				}
				var item = {'id': key, 'position': position, 'expired': expired, 'tm':n};
				if(fs.existsSync(fpath)){
					cache_db.get('id', key, (_item)=>{
						if(_item){
							cache_db.update_by_id(_item.id, item, ()=>{
								callback(fpath);
							});
						} else {
							cache_db.put(item, ()=>{
								callback(fpath);
							});
						}
					});
				} else {
					callback(null);
				}
			} else {
				callback(null);
			}
		});
	},
	clean:function(callback){
		var n = helpers.snow();
		cache_db.query_by_raw_sql('where expired>0 and expired<'+n,(items)=>{
			if(items){
				for(var i=0;i<items.length;i++){
					var item = items[i];
					httpcache.remove_cache_file(item);
				}
				cache_db.update_by_raw_sql('delete from cachelog where expired>0 and expired<'+n, callback);
			} else {
				if(callback){
					callback();
				}
			}
		});
	},
	recover_cache_file:function(ori_url, params, callback){
		var key = md5(ori_url);
		var n = helpers.snow();
		cache_db.get('id', key, (item)=>{
			var cache_file_path = null;
			var final_call = (cache_file_path)=>{
				if(!cache_file_path){
					httpcache.sync_from_remote(ori_url, key, params, (_cache_file_path)=>{
						callback(_cache_file_path);
					});
				} else {
					callback(cache_file_path);
				}
			};
			if(item){
				if(item.expired < n){
					httpcache.remove_cache_file(item);
					cache_db.del('id', key, ()=>{
						final_call(null);
					});
				} else {
					console.log('cache['+key+'] hit ok!');
					cache_file_path = httpcache.check_cache_file(item);
					final_call(cache_file_path)
				}
			} else {
				final_call(null);
			}
		});
	},
	actions:{
		"image":function(ori_url, params, callback){
			var mType = 'image/png';
			httpcache.recover_cache_file(ori_url, params, (cache_file_path)=>{
				var buffer = null;
				if(!cache_file_path){
					buffer = httpcache.default_img.toPNG();
					callback(mType, buffer);
				} else {
					buffer = nativeImage.createFromPath(cache_file_path).toPNG();
					if(!buffer){
						buffer = httpcache.default_img.toPNG();
					}
					callback(mType, buffer);
				}
			});
		},
		"plain":function(ori_url, params, callback){
			var mType = 'text/plain';
			httpcache.recover_cache_file(ori_url, params, (cache_file_path)=>{
				var buffer = Buffer.from('');
				if(!cache_file_path){
					callback(mType, buffer);
				} else {
					var rs = fs.createReadStream(cache_file_path);
					var datas = [];
					rs.on('data', (chunk)=>{datas.push(chunk);});
					rs.on('end', ()=>{
						buffer = Buffer.concat(datas);
						callback(mType, buffer);
					});
					rs.on('error', (err)=>{
						buffer = Buffer.from(err);
						callback(mType, buffer);
					});
				}
			});
		}
	},
	handler:function(request, callback){
		// console.log("request:", request);
		var accept = request.headers.Accept;
		var url = request.url;
		var method = request.method;
		var ori_url = url.substring(httpcache.scheme.length+1);
		var idx = ori_url.toLowerCase().indexOf('http');
		var params = {'timeout': 3600, 'position': '0'};
		if(idx>1){
			var _p_s = ori_url.substring(0, idx-1);
			var parameters = _p_s.split(':');
			var tm = parseInt(parameters[0]);
			if(tm && tm > 0){
				params['timeout'] = tm;
			}
			if(parameters.length>1){
				params['position'] = parameters[1];
			}
		}
		// console.log('cache params:', params);
		if(idx>0){
			ori_url = ori_url.substring(idx);
		}
		
		// console.log("accept:", accept, ",url:", url, ",ori_url:", ori_url, ", method:", method);
		var t = httpcache.guess_type(accept);
		var action = httpcache.actions[t];
		action(ori_url, params, (mType, buffer)=>{
			callback({mimeType: mType, data: buffer});
		});
		
	},
	completion:function(error){
		if(error){
			console.error('Failed to register protocol!');
		}
	},
	protocol:null,
	init:function(protocol, default_img, cache_dir){
		httpcache.dir = cache_dir;
		httpcache.default_img= default_img;
		httpcache.protocol = protocol;
		httpcache.protocol.registerBufferProtocol(
			httpcache.scheme, 
			httpcache.handler, 
			httpcache.completion
		);
	},
	quit:function(){
		if(httpcache.protocol){
			httpcache.protocol.unregisterProtocol(httpcache.scheme);
			console.log("unregister scheme:", httpcache.scheme);
		}
	}
}
module.exports = httpcache;