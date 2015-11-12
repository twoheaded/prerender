var mongoose = require('mongoose'),
    cache_manager = require('cache-manager'),
    util = require('../util.js');

var mongoUri = process.env.MONGOLAB_URI ||
    process.env.MONGOHQ_URL ||
    'mongodb://localhost/prerender';

mongoose.connect(mongoUri);

var db = mongoose.connection;

db.on('error', function (err) {
    util.log('Mongoose connection error: ' + err.message);
});

db.once('open', function callback() {
    util.log('Connected to prerender DB');
});

var Page = mongoose.model('Page', mongoose.Schema({
    _id: {type: String, required: true},
    value: {type: String, required: true},
    created: {type: Date, default: Date.now}
}));


var mongo_cache = {
    get: function (key, callback) {
        Page.findOne({_id: key}, function (err, item) {
            if (item && item.value) {
                callback(err, item);
            } else {
                callback(err, null);
            }
        });
    },
    set: function (key, value, callback) {
        var page = {value: value, created: new Date()};
        Page.update({_id: key}, page, {upsert: true}, function (err) {
        });
    }
};

module.exports = {
    init: function () {
        this.cache = cache_manager.caching({
            store: mongo_cache
        });
    },

    beforePhantomRequest: function (req, res, next) {
        if (req.method !== 'GET') {
            util.log('Not a GET request.');
            return next();
        }

        var date = new Date();
        //set 3-days cache storage period
        date.setDate(date.getDate() - 3);
        util.log(date);

        this.cache.get(req.url, function (err, page) {
            if (!err && page && page.created >= date) {
                res.send(200, page.value);
            } else {
                next()
            }
        });
    },

    beforeSend: function (req, res, next) {
        if (req.prerender.statusCode !== 200) {
            this.cache.get(req.url, function (err, page) {
                if (!err && page) {
                    res.send(200, page.value);
                } else {
                    next()
                }
            });
        } else {
            next();
        }
    },

    afterPhantomRequest: function (req, res, next) {
        this.cache.set(req.url, req.prerender.documentHTML);
        next();
    }
};

