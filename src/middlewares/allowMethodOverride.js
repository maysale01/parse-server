var allowMethodOverride = function(req, res, next) {
    if (req.method === 'POST' && req.body._method) {
        req.originalMethod = req.method;
        req.method = req.body._method;
        delete req.body._method;
    }
    next();
};

module.exports = allowMethodOverride;