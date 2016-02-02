var Parse = require('parse/node').Parse;

var Auth        = require('../classes/Auth'),
    Config      = require('../classes/Config');

var cache = require('../utils/cache');

// Checks that the request is authorized for this app and checks user
// auth too.
// The bodyparser should run before this middleware.
// Adds info to the request:
// req.config - the Config for this app
// req.auth - the Auth for this request
function handleParseHeaders(req, res, next) {
    var mountPathLength = req.originalUrl.length - req.url.length;
    var mountPath = req.originalUrl.slice(0, mountPathLength);
    var mount = req.protocol + '://' + req.get('host') + mountPath;

    var info = {
        appId: req.get('X-Parse-Application-Id'),
        sessionToken: req.get('X-Parse-Session-Token'),
        masterKey: req.get('X-Parse-Master-Key'),
        installationId: req.get('X-Parse-Installation-Id'),
        clientKey: req.get('X-Parse-Client-Key'),
        javascriptKey: req.get('X-Parse-Javascript-Key'),
        dotNetKey: req.get('X-Parse-Windows-Key'),
        restAPIKey: req.get('X-Parse-REST-API-Key')
    };

    var fileViaJSON = false;

    if (!info.appId || !cache.apps[info.appId]) {
    // See if we can find the app id on the body.
        if (req.body instanceof Buffer) {
      // The only chance to find the app id is if this is a file
      // upload that actually is a JSON body. So try to parse it.
          req.body = JSON.parse(req.body);
          fileViaJSON = true;
      }

        if (req.body && req.body._ApplicationId
    && cache.apps[req.body._ApplicationId]
    && (
      !info.masterKey
      ||
      cache.apps[req.body._ApplicationId]['masterKey'] === info.masterKey)
    ) {
          info.appId = req.body._ApplicationId;
          info.javascriptKey = req.body._JavaScriptKey || '';
          delete req.body._ApplicationId;
          delete req.body._JavaScriptKey;
      // TODO: test that the REST API formats generated by the other
      // SDKs are handled ok
          if (req.body._ClientVersion) {
            info.clientVersion = req.body._ClientVersion;
            delete req.body._ClientVersion;
        }
          if (req.body._InstallationId) {
            info.installationId = req.body._InstallationId;
            delete req.body._InstallationId;
        }
          if (req.body._SessionToken) {
            info.sessionToken = req.body._SessionToken;
            delete req.body._SessionToken;
        }
          if (req.body._MasterKey) {
            info.masterKey = req.body._MasterKey;
            delete req.body._MasterKey;
        }
      } else {
          return invalidRequest(req, res);
      }
    }

    if (fileViaJSON) {
    // We need to repopulate req.body with a buffer
        var base64 = req.body.base64;
        req.body = new Buffer(base64, 'base64');
    }

    info.app = cache.apps[info.appId];
    req.config = new Config(info.appId, mount);
    req.database = req.config.database;
    req.info = info;

    var isMaster = (info.masterKey === req.config.masterKey);

    if (isMaster) {
        req.auth = new Auth.Auth(req.config, true);
        next();
        return;
    }

  // Client keys are not required in parse-server, but if any have been configured in the server, validate them
  //  to preserve original behavior.
    var keyRequired = (req.config.clientKey
    || req.config.javascriptKey
    || req.config.dotNetKey
    || req.config.restAPIKey);
    var keyHandled = false;
    if (keyRequired
    && ((info.clientKey && req.config.clientKey && info.clientKey === req.config.clientKey)
      || (info.javascriptKey && req.config.javascriptKey && info.javascriptKey === req.config.javascriptKey)
      || (info.dotNetKey && req.config.dotNetKey && info.dotNetKey === req.config.dotNetKey)
      || (info.restAPIKey && req.config.restAPIKey && info.restAPIKey === req.config.restAPIKey)
    )) {
        keyHandled = true;
    }
    if (keyRequired && !keyHandled) {
        return invalidRequest(req, res);
    }

    if (!info.sessionToken) {
        req.auth = new Auth.Auth(req.config, false);
        next();
        return;
    }

    return Auth.getAuthForSessionToken(
    req.config, info.sessionToken).then((auth) => {
        if (auth) {
            req.auth = auth;
            next();
        }
    }).catch((error) => {
      // TODO: Determine the correct error scenario.
        console.log(error);
        throw new Parse.Error(Parse.Error.UNKNOWN_ERROR, error);
    });

}

function invalidRequest(req, res) {
    res.status(403);
    res.end('{"error":"unauthorized"}');
}

module.exports = handleParseHeaders;