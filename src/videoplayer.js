const Window = require('./window.js')
const helpers = require("./helper.core.js")
const Base = require("./base.js")
var player_action = function(args){
	var self = this;
	var cmd = args.cmd;
	var vp = self.options.ctx;
	if("sources" == cmd){
		self.send({'tag':'player', 'sources': vp.sources, 'cmd':args.cmd});
	}
};
var win_option = {
	width:410, height:350,
	onMessage:function(win, args){
		var self = this;
		var tag = args.tag;
		var vp = self.options.ctx;
		if("inited" == tag){
			args.tag = 'start';
			args['sources'] = vp.sources;
			self.account.check_state((isok, rs)=>{
				args['lg_rs'] = isok
				args['rs'] = rs
				args['point'] = helpers.point;
				self.send(args);
			});
		} else if("started" == tag){
			
		} else if("player" == tag){
			player_action.apply(self, [args]);
		}
	}
};
var videoplayer = Base.extend({
	constructor:function(account, options){
		this.options = options;
		this.account = account;
		if(options){
			this.cfg = options.cfg?options.cfg:{};
		}
		this.sources = [];
		this.win = null;
	},
	init:function(){
		var self = this;
		if(!this.win){
			var dir_name = this.cfg.get('dir_name');
			this.win = new Window("VideoPlayer", "videorenderer.js", `file://${dir_name}/player.html`,
				this.account, {
				'ctx':self,
				'cfg': self.cfg,
				win:win_option
			});
		}
	},
	open:function(task){
		// console.log('open task:', task);
		if(task.file_url && task.type){
			if('video/mp4' == task.type){
				this.sources = [{
					type: task.type + ';codecs="avc1.42E01E, mp4a.40.2"',
					src:task.file_url
				}];
			} else if(task.type.indexOf('mp3')>=0){
				this.sources = [{
					type: task.type,
					src:task.file_url
				}];
			}
		}
		if(this.win){
			// console.log('videoplayer open task:', task);
			this.win.open();
		}
	}
});

module.exports = videoplayer;