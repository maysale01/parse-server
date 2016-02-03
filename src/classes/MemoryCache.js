export default class MemoryCache {
    constructor(args = {}) {
        this._apps = Object.assign({}, args.apps);
        this._stats = Object.assign({}, args.stats);
        this._users = Object.assign({}, args.users);
        this._isLoaded = false;
    }

    get isLoaded() {
        return this._isLoaded;
    }

    set isLoaded(value) {
        this._isLoaded = value;
    }

    // TODO: remove this.. backwards compatibility for the time being
    get apps() {
        return this._apps;
    }

    registerApp(appId, app) {
        this._apps[appId] = app;
    }

    getApp(appId) {
        return this._apps[appId];
    }

    updateStat(key, value) {
        this._stats[key] = value;
    }

    getUser(sessionToken) {
        return this._users[sessionToken];
    }

    setUser(sessionToken, userObject) {
        this._users[sessionToken] = Object.assign({}, userObject);
    }

    clearUser(sessionToken) {
        delete this._users[sessionToken];
    }
}
