'use strict';

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

// ParseServer works like a constructor of an express app.
// The args that we understand are:
// "databaseAdapter": a class like ExportAdapter providing create, find,
//                    update, and delete
// "filesAdapter": a class like GridStoreAdapter providing create, get,
//                 and delete
// "databaseURI": a uri like mongodb://localhost:27017/dbname to tell us
//          what database this Parse API connects to.
// "cloud": relative location to cloud code to require
// "appId": the application id to host
// "masterKey": the master key for requests to this app
// "facebookAppIds": an array of valid Facebook Application IDs, required
//                   if using Facebook login
// "collectionPrefix": optional prefix for database collection names
// "fileKey": optional key from Parse dashboard for supporting older files
//            hosted by Parse
// "clientKey": optional key from Parse dashboard
// "dotNetKey": optional key from Parse dashboard
// "restAPIKey": optional key from Parse dashboard
// "javascriptKey": optional key from Parse dashboard

var ParseServer = function ParseServer(args) {
  _classCallCheck(this, ParseServer);

  if (!args.appId || !args.masterKey) {
    throw 'You must provide an appId and masterKey!';
  }

  if (args.databaseAdapter) {
    DatabaseAdapter.setAdapter(args.databaseAdapter);
  }

  if (args.filesAdapter) {
    FilesAdapter.setAdapter(args.filesAdapter);
  }

  if (args.databaseURI) {
    DatabaseAdapter.setAppDatabaseURI(args.appId, args.databaseURI);
  }

  if (args.cloud) {
    addParseCloud();
    require(args.cloud);
  }

  cache.apps[args.appId] = {
    masterKey: args.masterKey,
    collectionPrefix: args.collectionPrefix || '',
    clientKey: args.clientKey || '',
    javascriptKey: args.javascriptKey || '',
    dotNetKey: args.dotNetKey || '',
    restAPIKey: args.restAPIKey || '',
    fileKey: args.fileKey || 'invalid-file-key',
    facebookAppIds: args.facebookAppIds || []
  };

  // To maintain compatibility. TODO: Remove in v2.1
  if (process.env.FACEBOOK_APP_ID) {
    cache.apps[args.appId]['facebookAppIds'].push(process.env.FACEBOOK_APP_ID);
  }

  // Initialize the node client SDK automatically
  Parse.initialize(args.appId, args.javascriptKey || '', args.masterKey);
};

function getClassName(parseClass) {
  if (parseClass && parseClass.className) {
    return parseClass.className;
  }
  return parseClass;
}

module.exports = ParseServer;