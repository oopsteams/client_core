// const _cfg = require('electron-cfg');
const Window = require('./window.js')
const helpers = require("./helper.core.js")
const Base = require("./base.js")
var view_action = function(args){
	var self = this;
	var cmd = args.cmd;
	var inst = self.options.ctx;
	if("sources" == cmd){
		// self.send({'tag':'player', 'sources': vp.sources, 'cmd':args.cmd});
	}
};
var win_option = {
	width:600, height:600,
	webPreferences:{'plugins': true},
	onDestroy:function(win){
		var self = this;
		var inst = self.options.ctx;
		inst.isopen = false;
	},
	onMessage:function(win, args){
		var self = this;
		var tag = args.tag;
		var inst = self.options.ctx;
		if("inited" == tag){
			args.tag = 'start';
			args['sources'] = inst.sources;
			self.account.check_state((isok, rs)=>{
				args['lg_rs'] = isok
				args['rs'] = rs
				args['platform'] = inst.cfg.get('platform');
				args['src'] = inst.file_url;
				args['point'] = helpers.point;
				self.send(args);
			});
		} else if("started" == tag){
			
		} else if("view" == tag){
			view_action.apply(self, [args]);
		}
	}
};
var viewpage = Base.extend({
	constructor:function(account, options){
		this.options = options;
		this.account = account;
		if(options){
			this.cfg = options.cfg?options.cfg:{};
		}
		this.isopen = false;
		this.sources = [];
		this.win = null;
		this.file_url = null;
	},
	init:function(){
		var self = this;
		if(!this.win){
			var dir_name = this.cfg.get('dir_name');
			this.win = new Window("ViewPage", "viewpagerenderer.js", `file://${dir_name}/viewer.html`,
				this.account, {
				'cookies':self.options.cookies,
				'ctx':self,
				'cfg': self.cfg,
				win:win_option
			});
		}
	},
	open:function(task){
		// console.log('open task:', task);
		if(task.file_url){
			this.file_url = task.file_url;
		}
		if(this.win){// && !this.isopen
			// var winCfg_options = _cfg.window().options();
			// console.log('viewpage win winCfg_options:', winCfg_options);
			// console.log('viewpage win winCfg_options window:', _cfg.window());
			this.win.open();
			this.isopen = true;
		}
		//  else {
		// 	this.win.send({'tag': 'update', 'src': this.file_url});
		// }
	}
});

module.exports = viewpage;