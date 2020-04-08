const {
	session,
	BrowserWindow
} = require('electron');
const Window = require('./window.js')
const helpers = require("./helper.core.js")
const Base = require("./base.js")
// const request = require('request');
const service = require('./service.js')
const filter = {
	urls: ['https://passport.baidu.com/*']
}

function parse_params(qs) {
	var idx = qs.indexOf('?');
	if (idx >= 0) {
		qs = qs.substring(idx + 1);
	}
	var rs = {};
	var params = qs.split('&');
	for (var i = 0; i < params.length; i++) {
		var entry = params[i].split('=');
		if (entry && entry.length > 1) {
			rs[entry[0]] = decodeURIComponent(entry[1]);
		}
	}
	return rs;
}
var send_msg = null;

var gparams = {
	'params': {}
};

function interceptHttp() {
	session.defaultSession.webRequest.onBeforeRequest(filter, (details, callback) => {
		// callback({cancel: false, requestHeaders: details.requestHeaders})
		if (details.method == 'POST' && 'uploadData' in details) {
			// console.log('details:', details);
			var uds = details.uploadData;
			if (uds.length > 0) {
				var bf = uds[0].bytes;
				var s = '';
				for (var k = 0; k < bf.length; k++) {
					s += String.fromCharCode(bf[k]);
				}
				console.log('url:', details.url);
				gparams.params = parse_params(s);
				gparams.params['url'] = details.url;
				// console.log('post params:',gparams);
				if (send_msg) {
					send_msg({
						'tag': 'upload',
						'cmd': 'login',
						'datas': gparams.params
					});
				}
			}
		}
		callback(details);
	})
	// this.win.webContents.send('asynchronous-spider',{'tag':'intercepted', 'st':0})
}
// var submit_action = function(args) {
// 	var self = this;
// 	cmd = args.cmd;
// 	var vp = self.options.ctx;
// 	if ("sources" == cmd) {
// 		self.send({
// 			'tag': 'player',
// 			'sources': vp.sources,
// 			'cmd': args.cmd
// 		});
// 	}
// };
var code_action = function(args) {
	var self = this;
	var bd_account = self.options.ctx;
	var result = args.code;
	var acc_name = gparams.params.username;
	var final_call = (json_obj) => {
		// console.log('json_obj:', json_obj);
		console.log('bd_account.callback:', bd_account.callback);
		self.close();
		if (bd_account.callback) {
			bd_account.callback(json_obj);
		}
	}
	if (result) {
		console.log('result code:', result);
		var auth_dns_domain = bd_account.auth.auth_dns_domain;
		var auth_params = bd_account.auth.auth_params;
		auth_params['code'] = result;
		var bd_api = auth_dns_domain + bd_account.auth.auth_point;
		service.bd_get(bd_api, auth_params, {}, (err, raw) => {
			var body = JSON.parse(raw);
			// console.log("body:", body);
			if (body.refresh_token && body.access_token) {
				var bd_user_point = auth_dns_domain + bd_account.auth.bd_user_point;
				var refresh_token = body.refresh_token;
				var access_token = body.access_token;
				var expires_in = body.expires_in;
				setTimeout(() => {
					var user_params = {
						"access_token": access_token
					}
					service.bd_get(bd_user_point, user_params, {
						"User-Agent": "pan.baidu.com"
					}, (err, raw) => {
						var body = JSON.parse(raw);
						// console.log("user body:", body);
						if (body) {
							body['refresh_token'] = refresh_token;
							body['access_token'] = access_token;
							body['expires_in'] = expires_in;
							if (!acc_name) acc_name = '' + body['userid'];
							body['acc_name'] = acc_name;
							service.post_json_server('', 'bdlogin/', body, (err, raw) => {
								var body = JSON.parse(raw);
								final_call(body);
							}, {
								error: (e) => {
									console.log('err:', e);
									final_call({
										"error_code": 2
									});
								}
							});
							gparams = {
								'params': {}
							};
							send_msg = function(payload) {
								self.win.send(payload);
							}
						} else {
							final_call({
								"error_code": 2
							});
						}
					}, {
						error: (e) => {
							console.log('err:', e);
							final_call({
								"error_code": 2
							});
						}
					});
				}, 800);
			} else {
				final_call({
					"error_code": 2
				});
			}
		}, {
			error: (e) => {
				console.log('err:', e);
				final_call({
					"error_code": 2
				});
			}
		});
	}
}
var win_option = {
	width: 650,
	height: 370,
	parent: BrowserWindow.getFocusedWindow(),
	onReady: function(win) {},
	onMessage: function(win, args) {
		var self = this;
		var tag = args.tag;
		var inst = self.options.ctx;
		if ("inited" == tag) {
			args.tag = 'start';
			self.account.check_state((isok, rs) => {
				args['lg_rs'] = isok
				args['rs'] = rs
				args['point'] = helpers.point;
				var auth_dns_domain = inst.auth.auth_dns_domain;
				args['redirect'] = auth_dns_domain + inst.auth.bdauth;
				self.send(args);
			});
		} else if ("started" == tag) {

		} else if ("code" == tag) {
			code_action.apply(self, [args]);
		}
	}
};
var bdaccount = Base.extend({
	constructor: function(auth, account, options) {
		this.options = options;
		this.account = account;
		if (options) {
			this.cfg = options.cfg ? options.cfg : {};
		}
		// console.log('bdaccount auth:', auth);
		this.auth = auth;
		this.win = null;
		this.callback = null;
	},
	init: function() {
		var self = this;
		if (!this.win) {
			var dir_name = this.cfg.get('dir_name');
			// var auth_dns_domain = self.auth.auth_dns_domain;
			var load_url = `file://${dir_name}/bdpage.html`;
			// auth_dns_domain + self.auth.bdauth
			this.win = new Window("BdAccount", "bdrenderer.js", load_url,
				this.account, {
					'cookies': self.options.cookies,
					'ctx': self,
					'cfg': self.cfg,
					win: win_option
				});
			interceptHttp();
		}
	},
	open: function(callback) {
		var self = this;
		this.callback = callback;
		if (this.win) {
			this.win.open();
			gparams = {
				'params': {}
			};
			send_msg = function(payload) {
				self.win.send(payload);
			}
		}
	}
});
module.exports = bdaccount;
