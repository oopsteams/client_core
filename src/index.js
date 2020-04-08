const {
	app,
	nativeImage,
	Tray,
	Menu,
	session
} = require('electron');
const unhandled = require('electron-unhandled');
const logger = require('electron-log');
// const cfg = require('electron-cfg');
// const request = require('request');
const fs = require('fs');
const os = require('os');
const path = require('path');
const helpers = require("./helper.core.js");
// const Base = require("./base.js");
// const service = require('./service.js');
const VideoPlayer = require('./videoplayer.js');

var hn = os.hostname();
var sysversion = os.release();

const filter = {
	urls: ['https://hm.baidu.com/*']
}
// var base_dir = os.homedir();
var dir_name = {key: "__dirname"};
const base_dir = path.resolve(process.execPath, '..');

function find_target_dir(_base_dir, target, contain) {
	var ep = _base_dir;
	var rt_p = ep;
	if (target) {
		var ep_split = ep.split(path.sep);
		var l = ep_split.length;
		var root_split = [];
		var find_pos = -1;
		for (var i = l; i > 0; i--) {
			var idx = i - 1;
			var sec = ep_split[idx].toLowerCase();
			if (sec.indexOf(target) >= 0) {
				find_pos = idx;
				break;
			} else {
				root_split.push(sec);
			}
		}
		if (find_pos > 0) {
			if (contain) find_pos = find_pos + 1;
			root_split = ep_split.slice(0, find_pos);
			rt_p = root_split.join(path.sep);
		} else {
			console.warn('target:', target, ',can not find it!');
		}
	}
	console.log('find_target_dir:', rt_p);
	return rt_p
}
var root_dir = find_target_dir(base_dir, app.getName(), false);
var resources_dir = find_target_dir(dir_name, 'resources', true)
var app_data_dir = path.join(root_dir, helpers.app_data_dir_name)
if (!fs.existsSync(app_data_dir)) {
	fs.mkdirSync(app_data_dir);
}
var download_dir = path.join(app_data_dir, helpers.download_dir_name);
if (!fs.existsSync(download_dir)) {
	fs.mkdirSync(download_dir);
}
var patch_data_dir = path.join(app_data_dir, helpers.patch_dir_name);
if (!fs.existsSync(patch_data_dir)) {
	fs.mkdirSync(patch_data_dir);
}
var data_dir = path.join(app_data_dir, helpers.data_dir_name);
//var dao = null;// wait data_dir make success
if (!fs.existsSync(data_dir)) {
	fs.mkdirSync(data_dir);
	// console.log('['+data_dir+']dir make success!');
	// dao = require('./dao.js');// wait data_dir make success
} else {
	// dao = require('./dao.js');// wait data_dir make success
	// console.log('['+data_dir+']dir exist!');
}
const Window = require('./window.js')

const dao = require('./dao.js');
unhandled();

function get_browser_ua() {
	var ua = '';
	var app_ver = app.getVersion();
	var _sysversion = sysversion.split('.').join('_');
	var sys_core = 'Windows NT 6.1';
	var platform = process.platform;
	var os_name = platform;
	if (platform == 'darwin') {
		sys_core = 'Macintosh';
		os_name = ' Intel Mac OS X ' + _sysversion;
	} else {
		os_name = ' ' + platform + '; ' + os.arch();
	}
	ua += 'IPBrowser/' + app_ver + ' ';
	ua += '(' + sys_core + ';' + os_name + ')';
	ua += ' ' + platform + '/' + sysversion + ' (KHTML, like Gecko) Chrome/' + process.versions.chrome;
	return ua;
}

function interceptHttp() {
	var self = this;
	session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
		// callback({cancel: false, requestHeaders: details.requestHeaders})
		var headers = details.requestHeaders;

		if (!headers) {
			headers = {
				'Referer': 'http://www.oopsteam.site'
			}
		} else {
			headers['Referer'] = 'http://www.oopsteam.site';
		}
		var app_ver = app.getVersion();
		var platform = process.platform;
		var _sysversion = sysversion.split('.').join('_');
		var ua = get_browser_ua();
		// console.log('ua:', ua);
		headers['User-Agent'] = ua;
		details.requestHeaders = headers;
		// console.log('url:', details.url, ',headers:', headers);
		callback({
			requestHeaders: headers
		});
	})
}
var lock_contact_btn = false;
var contact_reply = function(args) {
	var self = this;
	var cmd = args.cmd;
	if ('invited' == cmd) {

	}
	lock_contact_btn = false;
	// console.log('unlock btn!!!');
}
var win_action = function(args) {
	var self = this;
	var cmd = args.cmd;
	if ('close' == cmd) {
		app.quit();
	} else if ('full' == cmd) {
		if (self.win) {
			if (!self.win.isMaximized()) {
				self.win.maximize();
			} else {
				self.win.unmaximize();
			}
		}
	} else if ('mini' == cmd) {
		if (self.win) {
			self.win.minimize();
		}
	}
}
var cfg_action = function(args) {
	var self = this;
	var cmd = args.cmd;
	if ('state' == cmd) {
		self.options.cfg.check_upgrade_info((rs) => {
			// console.log('cfg state!!!!!!!!,rs:', rs);
			self.send({
				'tag': 'cfg',
				'datas': rs,
				'cmd': args.cmd
			});
		});
	}
};
var task_action = function(args) {
	var self = this;
	var cmd = args.cmd;
	// console.log('task_action cmd:', cmd);
	if ('resume' == cmd) {
		self.options.nsloader.resume(args.id, () => {
			console.log('resume reply!!!!!!!!');
			self.send({
				'tag': 'prog',
				'id': args.id,
				'cmd': args.cmd
			});
		});
	} else if ('pause' == cmd) {
		self.options.nsloader.pause(args.id, () => {
			console.log('pause reply!!!!!!!!');
			self.send({
				'tag': 'prog',
				'id': args.id,
				'cmd': args.cmd
			});
		});
	} else if ('move' == cmd) {
		self.options.nsloader.move_file(args.id, () => {
			console.log('move reply!!!!!!!!');
			self.send({
				'tag': 'prog',
				'id': args.id,
				'cmd': args.cmd
			});
		});
	} else if ('del' == cmd) {
		self.options.nsloader.del(args.id, () => {
			console.log('del reply!!!!!!!!');
			self.send({
				'tag': 'prog',
				'id': args.id,
				'cmd': args.cmd
			});
		});
	} else if ('play' == cmd) {
		var data = args.data;
		// console.log('play data:', data);
		self.options.vplayer.open(data);
	} else if ('view' == cmd) {
		var data = args.data;
		// console.log('view args:', args);
		self.options.viewpage.open(data);
	}
}

var download_action = function(args) {
	var self = this;
	var cmd = args.cmd;
	if ("init" == cmd) {
		var datas = self.options.nsloader.checkout_tasks();
		self.send({
			'tag': 'download',
			'datas': datas,
			'cmd': args.cmd
		});
	} else if ("checkstate" == cmd) {
		var task_list = self.options.nsloader.compute_progress();
		// console.log('download_action checkstate.task_list:', task_list);
		self.send({
			'tag': 'download',
			'datas': task_list,
			'cmd': 'checkstate'
		});
	}
};
var file_action = function(args) {
	var self = this;
	var cmd = args.cmd;
	if ("info" == cmd) {
		var data = args.data;
		setTimeout(() => {
			var media_type = data.media_type;
			var fetch_real_url = true;
			if ('image' == media_type) {
				fetch_real_url = false;
			}
			self.options.nsproxy.fetch_file_view_info(args.id, fetch_real_url, (rs) => {
				// console.log("nsproxy cb rs:", rs);
				self.send({
					'tag': 'tree',
					'id': args.id,
					'data': rs,
					'cmd': args.cmd
				});
			});
		}, 2000);
	} else if ("download" == cmd) {
		var data = args.data;
		// console.log("file download:", data);
		self.options.nsloader.new_download_ready(data, (fail, rs) => {
			self.send({
				'tag': 'tree',
				'id': args.id,
				'data': rs,
				'fail': fail,
				'cmd': "download"
			});
		});
	} else if ("checkstate" == cmd) {
		var id = args.data.id;
		self.options.nsloader.check_ready_state(args.data, (fail, rs) => {
			self.send({
				'tag': 'tree',
				'id': id,
				'data': rs,
				'cmd': "download_state"
			});
		});
	} else if ("transfer" == cmd) {
		var id = args.data.id;
		self.options.nsproxy.transfer_ready(args.data, (fail, rs, body) => {
			self.send({
				'tag': 'tree',
				'id': id,
				'data': rs,
				'cmd': "transfer"
			});
		});
	} else if ("transfercheckstate" == cmd) {
		var id = args.data.id;
		self.options.nsproxy.check_ready_state((fail, rs, body) => {
			console.log('send transfer_state msg:', rs);
			self.send({
				'tag': 'tree',
				'id': id,
				'data': rs,
				'cmd': "transfer_state"
			});
		});
	} else if ("opensharewin" == cmd) {
		var data = args.data;
		var shared = data.shared;
		var nodedata = data.node;
		console.log('shared:', shared, ',nodedata:', nodedata);
		self.options.sharewin.open(data, () => {
			console.log('open shared win ok!!!!!!!');
			self.send({
				'tag': 'tree',
				'cmd': "opensharewinok"
			});
		});
	}

};
var win_option = {
	minWidth: 500,
	minHeight: 500,
	onMessage: function(win, args) {
		var self = this;
		var tag = args.tag;
		var cfg = self.options.cfg;
		if ("inited" == tag) {
			args.tag = 'start';
			self.account.check_state((isok, rs) => {
				args['lg_rs'] = isok
				args['rs'] = rs
				args['point'] = helpers.point;
				args['version'] = self.options.version;
				args['os'] = {
					'version': self.options.version,
					'platform': cfg.get('platform')
				};
				self.send(args);
			});
		} else if ("started" == tag) {

		} else if ("login" == tag) {
			var user = args.user;
			console.log("onMessage user:", user);
			self.account.login(user, (logined, rs) => {
				args.rs = rs
				self.send(args);
			});
		} else if ("logout" == tag) {
			self.account.clear_token(() => {
				self.send(args);
			});
		} else if ("file" == tag) {
			// console.log("get file:", args.data, ",node id:", args.id);
			file_action.apply(self, [args]);
		} else if ("download" == tag) {
			download_action.apply(self, [args]);
		} else if ('prog' == tag) {
			task_action.apply(self, [args]);
		} else if ('cfg' == tag) {
			cfg_action.apply(self, [args]);
		} else if ('contact' == tag) {
			console.log('contact msg:', args);
			contact_reply.apply(self, [args]);
		} else if ('bdlogin' == tag) {
			var auth = args.auth;
			self.account.bdlogin(auth, (logined, rs) => {
				args.rs = rs
				args.tag = 'login';
				self.send(args);
			});
		} else if ('win' == tag) {
			win_action.apply(self, [args]);
		}
	},
	onDestroy: function(win) {

		on_quit_app();
		app.quit();
	}
}
var contact_action = null;
const template = [{
		label: '增值服务',
		submenu: [{
				type: 'separator'
			},
			{
				label: '加入会员',
				click: () => {
					if (contact_action) contact_action("可索取全部资源!");
				}
			},
			{
				label: '申请代理',
				click: () => {
					if (contact_action) contact_action("可索取全部资源,可发展会员!");
				}
			}
		]
	},
	{
		label: 'Help',
		submenu: [
			// { role: 'toggledevtools' },
			// { type: 'separator' },
			{
				role: 'cut'
			},
			{
				role: 'copy'
			},
			{
				role: 'paste'
			},
			{
				type: 'separator'
			},
			{
				role: 'quit'
			}
		]
	}
]
var on_quit_listener_list = [];
var bindonquit = (listener) => {
	on_quit_listener_list.push(listener);
};

function on_quit_app() {
	if (on_quit_listener_list && on_quit_listener_list.length > 0) {
		on_quit_listener_list.forEach((l, idx) => {
			l();
		});
	}
	if (dao) {
		dao.close();
	}
}
app.on('window-all-closed', () => {
	on_quit_app();
	if (process.platform !== 'darwin') {
		app.quit();
	}
});
// var env_kv = process.env;
// console.log('env_kv:', env_kv);

//"userAgent": "pc;pc-mac;10.13.6;macbaiduyunguanjia"
const netdiskversion = '2.1';
const default_cfg_items = [{
		'key': 'platform',
		'value': process.platform,
		'name': 'platform'
	},
	{
		'key': 'hostname',
		'value': hn,
		'name': 'hostname'
	},
	{
		'key': 'dir_name',
		'value': dir_name,
		'name': 'dir_name'
	},
	{
		'key': 'sysversion',
		'value': sysversion,
		'name': 'sysversion'
	},
	{
		'key': 'netdiskversion',
		'value': netdiskversion,
		'name': 'netdiskversion'
	},
	{
		'key': 'app_data_dir',
		'value': app_data_dir,
		'name': '应用根目录'
	},
	{
		'key': 'resources_dir',
		'value': resources_dir,
		'name': 'Res根目录'
	},
	{
		'key': 'data_dir',
		'value': data_dir,
		'name': '应用数据目录'
	},
	{
		'key': 'download_dir',
		'value': download_dir,
		'name': '应用资源下载目录'
	},
	{
		'key': 'patch_data_dir',
		'value': patch_data_dir,
		'name': '补丁下载目录'
	}
];
// console.log('default_cfg_items:', default_cfg_items);
let tray = null;

function build_tray() {
	const icon = nativeImage.createFromDataURL(
		'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAABmJLR0QAAAAAAAD5Q7t/AAAACXBIWXMAAAsSAAALEgHS3X78AAABvElEQVQ4y4XUu2tUQRQG8N/u3s0aXR+QSsVHK4K96SRgCvHRCIGIYILiI+BfYWWthbHzCeILLVTEwkKtBQshopjKQsOKD4yrazGzeB3uHT8YLnPuN9/MmfOdaWAaR3AJPaxAEy0M4viCQ/iNWxiN/9v+ooE1YnAHxtRjExYxJ4+5Aj/xsrTLoIJ4HK+wkBEbx0QzCVaJTWItLmN9RvAUHjfl0cJp3MYHFDW8SazG1f8JzuAjXmALvlVwmkJRb2IpJ7gOUziPrzHtHxW8PViFe0P13J0s4HlMvcBywhkVbHcNn2TuZDsmMBvnI+jgV8LbL/j2Rjn/FA2cwBO8LcXbgrGH6OIALgrWqxUcx1acSzZp+9dW++Kd3k8rlGIWd7GUCBbox3krCl5PF6eCe4V+vJLEh307TPkwvuNBTrCLk0JHpH4r4ugJlZ0SKjvICc4I3XCn4hqacfEiDsbvIzVE2ChY4IJqjOAzNmB3zEJO8Bhe41mG9x674umeymCb4LnNGU4HZ/EwnrKMRkqeF4pBqGSVlVbiHc7UbDiGnegUwivyRujdruC1foncjwt6wiNxVGi3vlCo5bhuGvN/AMd/Wh7S3ewfAAAAAElFTkSuQmCC'
	);
	tray = new Tray(icon)
	const contextMenu = Menu.buildFromTemplate([{
			label: '加入会员',
			click: () => {
				if (contact_action) contact_action("可索取全部资源!");
			}
		},
		{
			label: '申请代理',
			click: () => {
				if (contact_action) contact_action("可索取全部资源,可发展会员!");
			}
		},
		{
			type: 'separator'
		},
		{
			label: '退出',
			click: () => {
				app.quit();
			}
		},
		{
			label: '版本:' + app.getVersion()
		}
	])
	tray.setToolTip('IP资源众筹')
	tray.setContextMenu(contextMenu)
}
app.on('ready', () => {
	var menu = Menu.buildFromTemplate([{
		role: 'quit'
	}]);
	Menu.setApplicationMenu(menu);
	build_tray();
	var looper = helpers.looper;
	var app_version = app.getVersion();
	// console.log('db data_dir:', data_dir);
	dao.initDatabase(data_dir, looper, () => {
		const Account = require('./account.js');
		const Nsproxy = require('./nsproxy.js');
		const Nsloader = require('./nsloader.js');
		const AppCfg = require("./appcfg.js");
		const Cookies = require('./cookies.js');
		const Sharewin = require('./sharewin.js');
		const Viewpage = require('./viewpage.js');

		var appcfg = new AppCfg(patch_data_dir, {
			'version': app_version
		});
		AppCfg.newtable(() => {
			console.log('newtable ok!');
			appcfg.init((cfg) => {
				interceptHttp();
				var cookies = new Cookies({
					'cfg': appcfg,
					'logger': logger
				});
				var final_call = () => {
					looper.start();
					var point = appcfg.get('point');
					var account = new Account({
						'point': point,
						'cfg': appcfg,
						'looper': looper,
						'logger': logger,
						'cookies': cookies
					});
					var nsproxy = new Nsproxy(account, {
						'point': point,
						'cfg': appcfg,
						'looper': looper,
						'logger': logger
					});
					var nsloader = new Nsloader(account, {
						'point': point,
						'cfg': appcfg,
						'looper': looper,
						'nsproxy': nsproxy,
						'logger': logger
					});
					var vplayer = new VideoPlayer(account, {
						'cfg': appcfg,
						'logger': logger
					});
					var sharewin = new Sharewin(account, {
						'cfg': appcfg,
						'logger': logger,
						'cookies': cookies
					});
					var viewpage = new Viewpage(account, {
						'cfg': appcfg,
						'logger': logger,
						'cookies': cookies
					});
					vplayer.init();
					sharewin.init();
					viewpage.init();
					var index_addr = cfg.get('index');
					console.log('cfg get index_addr:',index_addr);
					if (!index_addr || index_addr.length == 0) index_addr = '/dist/index.html';
					var index_file_path = `${patch_data_dir}${index_addr}`;
					if (!fs.existsSync(index_file_path)) {
						console.log('can not find prod ui:', index_file_path);
						index_addr = '/dist/index.html';
						index_file_path = `${dir_name}${index_addr}`;
					}
					var load_url = `file://${index_file_path}`;
					console.log('load main url:', load_url);
					var g_win = new Window("OopsTeam", "renderer.js", load_url, account, {
						'cfg': appcfg,
						'nsproxy': nsproxy,
						'nsloader': nsloader,
						'sharewin': sharewin,
						'vplayer': vplayer,
						'viewpage': viewpage,
						'logger': logger,
						'version': app_version,
						'cookies': cookies,
						win: win_option
					});
					nsloader.parent_win = g_win;
					nsloader.correct(() => {
						g_win.open();
					});
					/*
					var delay_cnt = 60;
					var delay_pos = 0;
					looper.addListener('heart', (context)=>{
						delay_pos++;
						if(delay_pos>=delay_cnt){
							delay_pos = 0;
							console.log('tag:', context.name,',tm:', Date.now());
						}
					}, {'name': 'test'})
					*/
					bindonquit(() => {
						looper.stop();
					});
					cfg.check_upgrade();
					contact_action = function(msg) {
						if (!lock_contact_btn) {
							var playload = {
								'tag': 'contact',
								'cmd': 'invite',
								'msg': msg
							};
							g_win.send(playload);
							lock_contact_btn = true;
						}
					}
					menu = Menu.buildFromTemplate(template)
					Menu.setApplicationMenu(menu);
				};
				helpers.iterator(default_cfg_items, (item, idx, cb) => {
					cfg.update(item.key, item.value, item.name, () => {
						cb(true);
					});
				}, (iscomplete, pos) => {
					final_call();
				});
				app.on('before-quit', (event) => {
					// event.preventDefault();
				});
			});
		});

	});

});
