// ParseServer - open-source compatible API Server for Parse apps
module.exports = {
  utils: require('./utils'),
  handlers: require('./handlers'),
  middlewares: require('./middlewares'),
  adapters: require('./adapters'),
  classes: require('./classes'),
  ParseServer: require('./classes').ParseServer
};
