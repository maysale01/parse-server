"use strict";
require("babel-polyfill");

const DEFAULT_DATABASE_URI = process.env.DEFAULT_DATABASE_URI || 'mongodb://localhost:27017/parse';

class DatabaseProvider {
    constructor(adapterClass) {
        if (typeof adapterClass !== 'function') {
            throw new Error('DatabaseProvider requires a class!');
        }

        this._appDatabaseURIs = {};
        this._dbConnections = {};
        this._adapterClass = adapterClass;
    }

    get adapterClass() {
        return this._adapterClass;
    }

    get dbConnections() {
        return this._dbConnections;
    }

    set adapterClass(value) {
        this._adapterClass = value;
    }

    set dbConnections(value) {
        this._dbConnections = value;
    }

    setAppDatabaseURI(appId, uri) {
        this._dbConnections[appId] = uri;
    }

    getDatabaseConnection(appId, collectionPrefix = "") {
        if (!appId) {
            throw new Error('You must pass a valid string as an appId to the getDatabaseConnection method!');
        }

        if (this._dbConnections[appId]) {
            return this._dbConnections[appId];
        }

        let dbURI = this._appDatabaseURIs[appId] ? this._appDatabaseURIs[appId] : DEFAULT_DATABASE_URI;

        this._dbConnections[appId] = new this.adapterClass(dbURI, {
            collectionPrefix: collectionPrefix
        });

        this._dbConnections[appId].connect();
        return this._dbConnections[appId];
    }
}

export default DatabaseProvider;