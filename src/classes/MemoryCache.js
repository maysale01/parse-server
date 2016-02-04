"use strict";
require("babel-polyfill");

import { default as CacheInterface } from '../interfaces/Cache';

let instance = null;

export default class MemoryCache extends CacheInterface {
    constructor() {
        super();

        if (!instance) {
            instance = this;
            this._apps = new Map();
            this._users = new Map();
        }

        return instance;
    }

    clear() {
        this._apps = new Map();
        this._users = new Map();
        return Promise.resolve(this);
    }

    getApp(key) {
        return Promise.resolve(this._apps.get(key));
    }

    setApp(key, value) {
        this._apps.set(key, value);
        return Promise.resolve(this);
    }

    hasApp(key) {
        return Promise.resolve(this._apps.has(key));
    }

    deleteApp(key) {
        return Promise.resolve(this._apps.delete(key));
    }

    getUser(key) {
        return Promise.resolve(this._users.get(key));
    }

    setUser(key, value) {
        this._users.set(key, value);
        return Promise.resolve(this);
    }

    hasUser(key) {
        return Promise.resolve(this._users.has(key));
    }

    deleteUser(key) {
        return Promise.resolve(this._users.delete(key));
    }
}
