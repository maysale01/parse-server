"use strict";
require("babel-polyfill");

// A Config object provides information about how a specific app is
// configured.
// mount is the URL for the root of the API; includes http, domain, etc.
export default class Config {
    constructor(args = {}) { 
        if (!args.app) {
            throw new Error('Config requires an instance of ParseApp!');
        }

        this._app = args.app;
        this._mount = args.mount;
    }

    get applicationId() {
        return this._app.applicationId;
    }

    get collectionPrefix() {
        return this._app.collectionPrefix;
    }

    get masterKey() {
        return this._app.masterKey;
    }

    get clientKey() {
        return this._app.clientKey;
    }
    
    get javascriptKey() {
        return this._app.javascriptKey;
    }

    get dotNetKey() {
        return this._app.dotNetKey;
    }

    get restAPIKey() {
        return this._app.restAPIKey;
    }

    get fileKey() {
        return this._app.fileKey;
    }

    get facebookAppIds() {
        return this._app.facebookAppIds;
    }

    get database() {
        return this._app.database;
    }

    get mount() {
        return this._mount;
    }
}

export default Config;