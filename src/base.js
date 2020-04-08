const helpers = require("./helper.core.js")

var Base = function(configuration){
	console.log('Base begin!!!');
	helpers.extend(this, configuration);
	this.initialize.apply(this, arguments);
	console.log('Base end!!!');
}
helpers.extend(Base.prototype, {
	_type: undefined,

	initialize: function() {
		this.hidden = false;
		this.logger = console;
	},
	log:function(){
		if(!this.logger){
			if(this.options && this.options.logger){
				this.logger = this.options.logger;
			}
		}
		if(this.logger){
			var _args = [];
			for(var idx in arguments){
				_args[idx] = arguments[idx];
			}
			this.logger.log.apply(this.logger,_args);
		} else {
			
			console.error('logger is null!')
		}
	}

});

Base.extend = helpers.inherits;

module.exports = Base;