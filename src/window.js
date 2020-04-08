const {
	BrowserWindow,
	ipcMain
} = require('electron');
const _cfg = require('electron-cfg');
const helpers = require("./helper.core.js");
const Base = require("./base.js")
const path = require('path');

function update_win_options(options, winCfg) {
	var winCfg_options = winCfg.options();
	// console.log('window winCfg_options:', winCfg_options);
	if (winCfg_options.hasOwnProperty('x')) {
		options['x'] = winCfg_options['x'];
		options['y'] = winCfg_options['y'];
	}
	if (winCfg_options.hasOwnProperty('width')) {
		options['width'] = winCfg_options['width'];
		options['height'] = winCfg_options['height'];
	}
}
var window_helper = Base.extend({
	constructor: function(name, renderer, load_url, account, options) {
		this.st = 0;
		this.name = name;
		this.renderer = renderer;
		this.load_url = load_url;
		this.account = account;
		this.options = options;
		this.win = null;
		this.quit = false;
		this.first_show = false;
		this.logger = options && options.logger ? options.logger : console.log;
		this.cfg = options && options.cfg ? options.cfg : null;
		this.bindonquit = options ? options.bindonquit : null;
		this.msg_point = 'asyn-' + this.name;
		this.msg_point_front = this.msg_point + '-front';
		this.win_listener = null;
		this.app_ready_done = false;
		this.winCfg = null;
		var self = this;
		if (this.bindonquit) {
			this.bindonquit(() => {
				self.quit = true;
				if (self.win) self.win.close();
			});
		}
		this.cookies = options && options.cookies ? options.cookies : null;
	},
	send: function(args) {
		var self = this;
		if (self.win) {
			// console.log('will send message:', self.msg_point_front, ',args tag:', args.tag);
			self.win.webContents.send(self.msg_point_front, args);
			return true;
		}
		return false;
	},
	onReady: function(win) {
		var self = this;
		if (win) {
			if (this.winCfg) {
				this.winCfg.assign(win);
			}
			win.show();
		}
		if (!this.app_ready_done) {
			this.app_ready_done = true;
			// Multi_loader.ready();
			// console.log("ready in.");
			if (this.options && this.options.win && this.options.win.onReady) {
				this.options.win.onReady.apply(self, [win]);
			}
		}
	},
	onDestroy: function(win) {
		var self = this;
		if (self.win_listener) {
			ipcMain.removeListener(self.msg_point, self.win_listener);
		}
		if (this.winCfg) {
			this.winCfg.unassign(win);
		}
		if (this.options && this.options.win && this.options.win.onDestroy) {
			this.options.win.onDestroy.apply(self, [win]);
		}
		if (this.cookies) this.cookies.sync();
	},
	onMessage: function(win, args) {
		var self = this;
		var tag = args.tag;
		if (this.options && this.options.win && this.options.win.onMessage) {
			this.options.win.onMessage.apply(self, [win, args]);
		}
	},
	close: function() {
		var self = this;
		if (self.win) {
			self.win.close();
		}
	},
	update_url: function(url) {
		this.load_url = url;
	},
	open: function() {
		var self = this;
		var dir_name = this.cfg.get('dir_name');
		if (!self.win) {
			var win_options = {
				name: self.name,
				width: 960,
				height: 650,
				modal: false,
				resizable: true,
				frame: false,
				show: false,
				closable: true,
				// transparent:true,
				// titleBarStyle: 'customButtonsOnHover',
				// titleBarStyle:'hiddenInset',
				titleBarStyle: 'hidden',
				webPreferences: {
					nodeIntegration: true,
					// webSecurity: false,
					allowRunningInsecureContent: true,
					preload: path.join(dir_name, self.renderer)
				}
			};
			if (this.options && this.options.win) {
				var wp = win_options.webPreferences;
				if (this.options.win.hasOwnProperty('webPreferences')) {
					helpers.extend(wp, this.options.win.webPreferences);
					delete this.options.win['webPreferences'];
				}
				helpers.extend(win_options, this.options.win);
			}
			this.winCfg = _cfg.window({
				'name': self.name
			});
			update_win_options(win_options, this.winCfg);
			// console.log('win_options:', win_options);
			var _win = new BrowserWindow(win_options);
			this.win = _win;
			this.win.on('ready-to-show', () => {
				self.onReady(_win);
			});
			this.win.on('closed', () => {
				self.onDestroy(self.win);
				self.win = null;
			});
			self.win.webContents.on('did-finish-load', () => {
				var script_str =
					'function __init__(){console.log(window.global_context);if(window.global_context && window.global_context.init){window.global_context.init("' +
					self.msg_point + '","' + self.msg_point_front + '");}else{window.setTimeout(__init__,1000)}};__init__();';
				// console.log('script_str:',script_str);
				self.win.webContents.executeJavaScript(script_str).then((result) => {});
			});

		}
		self.win_listener = (event, args) => {
			// console.log('event:', event, ',args:', args);
			// console.log('args:', args);
			self.onMessage(self.win, args);
		};
		// openDevTools
		// this.win.webContents.openDevTools();


		ipcMain.on(self.msg_point, self.win_listener);
		var loc_to_url = () => {
			var ua = self.cfg.get_ua();
			self.win.loadURL(self.load_url, {
				"userAgent": ua
			});
		}
		if (this.cookies) {
			this.cookies.init(self.win, () => {
				loc_to_url();
			});
		} else {
			console.log('cookies is null');
			loc_to_url();
		}

		// this.win.loadURL(self.load_url, {
		// 	"httpReferrer": "http://www.oopsteam.site/"
		// });
	}
});
module.exports = window_helper;
